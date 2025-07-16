import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.208.0/http/file_server.ts";

const PORT = 8721;

let metricHistory = {
  cpu: [],
  memory: [],
  network: {}
};

const COLLECTION_INTERVAL = 5000;
const MAX_HISTORY_POINTS = 60;

async function executeCommand(command: string): Promise<string> {
  const cmd = new Deno.Command("bash", {
    args: ["-c", command],
    stdout: "piped",
    stderr: "piped"
  });
  
  const { stdout, stderr } = await cmd.output();
  if (stderr.length > 0) {
    throw new Error(new TextDecoder().decode(stderr));
  }
  
  return new TextDecoder().decode(stdout);
}

function authenticateRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (url.pathname.includes('.css') || url.pathname.includes('.js')) {
    return true;
  }
  
  const auth = { login: 'penguin', password: 'penguin' };
  const authHeader = request.headers.get('authorization') || '';
  const b64auth = authHeader.split(' ')[1] || '';
  
  if (!b64auth) return false;
  
  const decoded = atob(b64auth);
  const [login, password] = decoded.split(':');
  
  return login === auth.login && password === auth.password;
}

async function getDiskUsage(devicePath: string): Promise<any> {
  try {
    const output = await executeCommand(`df -h ${devicePath}* | grep -v /dev/loop`);
    const partitions = [];
    
    output.trim().split('\n').forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 6) {
        partitions.push({
          filesystem: parts[0],
          size: parts[1],
          used: parts[2],
          available: parts[3],
          percentage: parts[4],
          mountpoint: parts[5]
        });
      }
    });
    
    return { partitions };
  } catch {
    return { error: 'Cannot get usage info' };
  }
}

async function getSmartData(devicePath: string): Promise<any> {
  try {
    const output = await executeCommand(`sudo smartctl -A ${devicePath}`);
    const lines = output.split('\n');
    const attributes = [];
    let temperature = null;
    let powerOnHours = null;
    let reallocatedSectors = null;
    let ssdLifeLeft = null;
    let inAttributesSection = false;

    lines.forEach(line => {
      if (line.includes('SMART Attributes Data Structure')) {
        inAttributesSection = true;
        return;
      }
      if (inAttributesSection && line.match(/^\s*\d+\s/)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 10) {
          const id = parseInt(parts[0], 10);
          const name = parts[1];
          const value = parseInt(parts[3], 10);
          const threshold = parseInt(parts[5], 10);
          const raw = parts[9];
          attributes.push({ id, name, value, threshold, raw });
          
          if (id === 194 || name.includes('Temperature')) {
            const tempMatch = raw.match(/(\d+)/);
            if (tempMatch) temperature = parseInt(tempMatch[1], 10);
          }
          if (id === 9 || name.includes('Power_On_Hours')) {
            powerOnHours = parseInt(raw, 10);
          }
          if (id === 5 || name.includes('Reallocated')) {
            reallocatedSectors = parseInt(raw, 10);
          }
          if (id === 231 || name.includes('SSD_Life_Left')) {
            ssdLifeLeft = parseInt(raw, 10);
          }
        }
      }
    });

    if (attributes.length === 0 || !temperature) {
      try {
        const tempOutput = await executeCommand(`sudo smartctl -a ${devicePath} | grep -i temperature`);
        let tempValue = null;
        const tempMatch = tempOutput.match(/Temperature:\s+(\d+)/i);
        if (tempMatch) tempValue = parseInt(tempMatch[1], 10);
        return { temperature: tempValue, attributes: [] };
      } catch {
        return { temperature: null, attributes: [] };
      }
    }
    
    return { temperature, powerOnHours, reallocatedSectors, ssdLifeLeft, attributes };
  } catch (error) {
    return { error: error.code === 127 ? 'smartctl not installed' : 'Cannot get SMART data' };
  }
}

async function getAllTemperatures(): Promise<any> {
  let cpuTemp = [];
  let systemTemp = [];
  let gpuTemp = [];

  try {
    const sensorsOutput = await executeCommand('sensors -j');
    const sensorsData = JSON.parse(sensorsOutput);
    
    if (sensorsData['coretemp-isa-0000']) {
      const coretemp = sensorsData['coretemp-isa-0000'];
      Object.keys(coretemp).forEach(key => {
        if (key.startsWith('Core')) {
          const core = coretemp[key];
          if (core && typeof core === 'object') {
            const temp = core.temp1_input || core.input || Object.values(core)[0];
            if (typeof temp === 'number') cpuTemp.push({ name: key, value: temp });
          }
        }
      });
    }

    if (sensorsData['k10temp-pci-00c3']) {
      const k10temp = sensorsData['k10temp-pci-00c3'];
      ['Tctl', 'Tdie', 'temp1'].forEach(sensor => {
        if (k10temp[sensor] && k10temp[sensor].temp1_input) {
          cpuTemp.push({ name: `CPU ${sensor}`, value: k10temp[sensor].temp1_input });
        }
      });
    }

    Object.keys(sensorsData).forEach(adapter => {
      if (adapter.toLowerCase().includes('radeon') || adapter.toLowerCase().includes('amdgpu') || adapter.toLowerCase().includes('nvidia')) {
        const gpu = sensorsData[adapter];
        if (gpu.temp1 && gpu.temp1.temp1_input) {
          gpuTemp.push({ name: 'GPU ' + adapter, value: gpu.temp1.temp1_input });
        }
      }
    });

    Object.keys(sensorsData).forEach(adapter => {
      if (adapter.includes('acpi') || adapter.includes('sys') || adapter.includes('mobo')) {
        const sys = sensorsData[adapter];
        Object.keys(sys).forEach(key => {
          if (key.includes('temp') && sys[key].temp1_input) {
            systemTemp.push({ name: `${adapter} ${key}`, value: sys[key].temp1_input });
          }
        });
      }
    });
  } catch (parseError) {
    console.error('Error parsing sensors output:', parseError);
  }

  if (cpuTemp.length === 0) {
    try {
      const coreOutput = await executeCommand('sensors | grep Core');
      coreOutput.trim().split('\n').forEach(line => {
        const match = line.match(/^(Core \d+):\s+\+(\d+\.\d+)°C/);
        if (match) cpuTemp.push({ name: match[1], value: parseFloat(match[2]) });
      });
    } catch {
      // ignore
    }
  }

  return await getDriveTemperatures(cpuTemp, systemTemp, gpuTemp);
}

async function getDriveTemperatures(cpuTemp = [], systemTemp = [], gpuTemp = []): Promise<any> {
  try {
    const disksOutput = await executeCommand('lsblk -d -o NAME,TYPE | grep disk | grep -v udev | cut -f1 -d" "');
    const disks = disksOutput.trim().split('\n').filter(disk => disk.length > 0);
    
    if (disks.length === 0) {
      return { cpu: cpuTemp, system: systemTemp, gpu: gpuTemp, drives: [] };
    }

    const drivePromises = disks.map(async (disk) => {
      const devicePath = `/dev/${disk}`;
      
      try {
        const tempOutput = await executeCommand(`sudo smartctl -A ${devicePath} | grep -i temperature`);
        const tempMatch = tempOutput.match(/\d+$/);
        if (tempMatch) {
          return { name: disk, value: parseFloat(tempMatch[0]), path: devicePath };
        }
      } catch {
        // ignore
      }

      if (disk.startsWith('nvme')) {
        try {
          const nvmeOutput = await executeCommand(`sudo nvme smart-log ${devicePath} | grep temperature`);
          const nvmeTempMatch = nvmeOutput.match(/:\s+(\d+)\s+C/);
          if (nvmeTempMatch && nvmeTempMatch[1]) {
            return { name: disk, value: parseFloat(nvmeTempMatch[1]), path: devicePath };
          }
        } catch {
          // ignore
        }
      }

      try {
        const smartOutput = await executeCommand(`sudo smartctl -a ${devicePath} | grep -i temperature`);
        let tempValue = null;
        
        const tempMatch1 = smartOutput.match(/Temperature:\s+(\d+)/i);
        if (tempMatch1 && tempMatch1[1]) {
          tempValue = parseFloat(tempMatch1[1]);
        }
        
        const tempMatch2 = smartOutput.match(/(\d+)\s+Celsius/i);
        if (!tempValue && tempMatch2 && tempMatch2[1]) {
          tempValue = parseFloat(tempMatch2[1]);
        }
        
        const tempMatch3 = smartOutput.match(/Drive Temperature:\s+(\d+)/i);
        if (!tempValue && tempMatch3 && tempMatch3[1]) {
          tempValue = parseFloat(tempMatch3[1]);
        }
        
        if (tempValue !== null) {
          return { name: disk, value: tempValue, path: devicePath };
        }
      } catch {
        // ignore
      }

      try {
        const sctOutput = await executeCommand(`sudo smartctl -l scttemp ${devicePath} | grep -i temperature`);
        const sctTempMatch = sctOutput.match(/(\d+)\s+Celsius/i);
        if (sctTempMatch && sctTempMatch[1]) {
          return { name: disk, value: parseFloat(sctTempMatch[1]), path: devicePath };
        }
      } catch {
        // ignore
      }

      return null;
    });
    
    const drives = await Promise.all(drivePromises);
    
    return {
      cpu: cpuTemp,
      system: systemTemp,
      gpu: gpuTemp,
      drives: drives.filter(drive => drive !== null)
    };
  } catch {
    return { cpu: cpuTemp, system: systemTemp, gpu: gpuTemp, drives: [] };
  }
}

async function initializeNetworkHistory() {
  try {
    const output = await executeCommand('cat /proc/net/dev');
    output.split('\n').filter(line => line.includes(':')).forEach(line => {
      const parts = line.trim().split(':');
      if (parts.length >= 2) {
        const ifName = parts[0].trim();
        if (ifName !== 'lo') {
          metricHistory.network[ifName] = { rx_bytes: [], tx_bytes: [] };
        }
      }
    });
  } catch {
    // ignore
  }
}

async function collectMetrics() {
  try {
    const loadAvg = await executeCommand('cat /proc/loadavg');
    const loadParts = loadAvg.split(' ');
    const load = parseFloat(loadParts[0]);
    
    const cpuInfo = await executeCommand('nproc');
    const cpuCount = parseInt(cpuInfo.trim());
    const cpuPercentage = Math.min((load / cpuCount) * 100, 100);

    metricHistory.cpu.push({
      timestamp: Date.now(),
      value: cpuPercentage
    });

    if (metricHistory.cpu.length > MAX_HISTORY_POINTS) {
      metricHistory.cpu.shift();
    }

    const memInfo = await executeCommand('cat /proc/meminfo');
    const memLines = memInfo.split('\n');
    let totalMem = 0;
    let freeMem = 0;

    memLines.forEach(line => {
      if (line.startsWith('MemTotal:')) {
        totalMem = parseInt(line.split(/\s+/)[1]) * 1024;
      } else if (line.startsWith('MemAvailable:')) {
        freeMem = parseInt(line.split(/\s+/)[1]) * 1024;
      }
    });

    const memPercentage = ((totalMem - freeMem) / totalMem) * 100;
    metricHistory.memory.push({ timestamp: Date.now(), value: memPercentage });
    
    if (metricHistory.memory.length > MAX_HISTORY_POINTS) {
      metricHistory.memory.shift();
    }

    const netOutput = await executeCommand('cat /proc/net/dev');
    netOutput.split('\n').filter(line => line.includes(':')).forEach(line => {
      const parts = line.trim().split(':');
      if (parts.length >= 2) {
        const ifName = parts[0].trim();
        const stats = parts[1].trim().split(/\s+/);

        if (ifName !== 'lo' && metricHistory.network[ifName]) {
          metricHistory.network[ifName].rx_bytes.push({
            timestamp: Date.now(),
            value: parseInt(stats[0], 10)
          });

          metricHistory.network[ifName].tx_bytes.push({
            timestamp: Date.now(),
            value: parseInt(stats[8], 10)
          });

          if (metricHistory.network[ifName].rx_bytes.length > MAX_HISTORY_POINTS) {
            metricHistory.network[ifName].rx_bytes.shift();
            metricHistory.network[ifName].tx_bytes.shift();
          }
        }
      }
    });
  } catch (error) {
    console.error('Error collecting metrics:', error);
  }
}

async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  
  if (!authenticateRequest(request)) {
    return new Response('Authentication required.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Server Logs Dashboard"' }
    });
  }

  if (url.pathname.startsWith('/api/')) {
    const headers = { 'Content-Type': 'application/json' };
    
    try {
      if (url.pathname === '/api/metrics/history') {
        return new Response(JSON.stringify(metricHistory), { headers });
      }
      
      if (url.pathname === '/api/metrics/cpu') {
        const loadAvg = await executeCommand('cat /proc/loadavg');
        const loadParts = loadAvg.split(' ');
        const load = [parseFloat(loadParts[0]), parseFloat(loadParts[1]), parseFloat(loadParts[2])];
        
        const cpuInfo = await executeCommand('nproc');
        const cpuCount = parseInt(cpuInfo.trim());
        const loadPercentage = Math.min((load[0] / cpuCount) * 100, 100);
        
        return new Response(JSON.stringify({
          cpuCount,
          loadAvg: load,
          loadPercentage: loadPercentage.toFixed(2)
        }), { headers });
      }
      
      if (url.pathname === '/api/metrics/memory') {
        const memInfo = await executeCommand('cat /proc/meminfo');
        const memLines = memInfo.split('\n');
        let totalMem = 0;
        let freeMem = 0;

        memLines.forEach(line => {
          if (line.startsWith('MemTotal:')) {
            totalMem = parseInt(line.split(/\s+/)[1]) * 1024;
          } else if (line.startsWith('MemAvailable:')) {
            freeMem = parseInt(line.split(/\s+/)[1]) * 1024;
          }
        });

        const usedMem = totalMem - freeMem;
        return new Response(JSON.stringify({
          total: totalMem,
          free: freeMem,
          used: usedMem,
          percentage: ((usedMem / totalMem) * 100).toFixed(2)
        }), { headers });
      }
      
      if (url.pathname === '/api/metrics/network') {
        const output = await executeCommand('cat /proc/net/dev');
        const lines = output.split('\n').filter(line => line.includes(':'));
        const interfaces = [];
        
        lines.forEach(line => {
          const parts = line.trim().split(':');
          if (parts.length >= 2) {
            const ifName = parts[0].trim();
            const stats = parts[1].trim().split(/\s+/);
            if (ifName !== 'lo') {
              interfaces.push({
                interface: ifName,
                rx_bytes: parseInt(stats[0], 10),
                rx_packets: parseInt(stats[1], 10),
                tx_bytes: parseInt(stats[8], 10),
                tx_packets: parseInt(stats[9], 10)
              });
            }
          }
        });
        
        return new Response(JSON.stringify({ interfaces }), { headers });
      }
      
      if (url.pathname === '/api/metrics/disks') {
        const output = await executeCommand('lsblk -d -o NAME,TYPE,SIZE,MODEL | grep disk');
        const lines = output.trim().split('\n');
        const diskPromises = lines.map(async (line) => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const name = parts[0];
            const size = parts[2];
            const model = parts.slice(3).join(' ');
            if (name.includes('udev')) {
              return null;
            }
            const devicePath = `/dev/${name}`;
            try {
              const [usage, smart] = await Promise.all([
                getDiskUsage(devicePath),
                getSmartData(devicePath)
              ]);
              return { name, devicePath, size, model: model || 'Unknown', usage, smart };
            } catch (error) {
              return { name, devicePath, size, model: model || 'Unknown', error: error.message };
            }
          }
          return null;
        });

        const results = await Promise.all(diskPromises);
        return new Response(JSON.stringify({ 
          disks: results.filter(disk => disk !== null) 
        }), { headers });
      }
      
      if (url.pathname === '/api/metrics/temperature') {
        try {
          await executeCommand('which sensors');
          const temps = await getAllTemperatures();
          return new Response(JSON.stringify(temps), { headers });
        } catch {
          try {
            await executeCommand('which smartctl');
            const temps = await getDriveTemperatures();
            return new Response(JSON.stringify(temps), { headers });
          } catch {
            return new Response(JSON.stringify({
              error: 'Temperature monitoring tools not found. Please install lm-sensors and smartmontools.',
              instructions: 'You can install these with: sudo apt-get install lm-sensors smartmontools && sudo sensors-detect'
            }), { headers });
          }
        }
      }
      
      if (url.pathname.startsWith('/api/logs/')) {
        const service = url.pathname.split('/')[3];
        const validServices = ['jellyfin', 'sonarr', 'prowlarr', 'radarr', 'transmission-daemon', 'fail2ban', 'netdata', 'unify'];
        
        if (!validServices.includes(service)) {
          return new Response(JSON.stringify({ error: 'Invalid service name' }), { 
            status: 400, 
            headers 
          });
        }
        
        const logs = await executeCommand(`journalctl -u ${service} -n 100 --no-pager`);
        return new Response(JSON.stringify({ logs }), { headers });
      }
      
      return new Response('Not found', { status: 404 });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers 
      });
    }
  }

  return serveDir(request, {
    fsRoot: "public",
    urlRoot: "",
  });
}

await initializeNetworkHistory();
setInterval(collectMetrics, COLLECTION_INTERVAL);

console.log(`Server running on http://localhost:${PORT}`);
await serve(handler, { port: PORT });
