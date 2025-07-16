document.addEventListener('DOMContentLoaded', () => {
  const logOutput = document.getElementById('log-output');
  const refreshButton = document.getElementById('refresh-button');
  const lastUpdated = document.getElementById('last-updated');
  const tabButtons = document.querySelectorAll('.tab-button');
  const cpuChart = document.getElementById('cpu-chart');
  const memoryChart = document.getElementById('memory-chart');
  const networkChart = document.getElementById('network-chart');
  const temperatureChart = document.getElementById('temperature-chart');
  const interfaceSelect = document.getElementById('interface-select');
  const tempTypeSelect = document.getElementById('temp-type-select');
  const tempNotAvailable = document.getElementById('temp-not-available');
  const refreshMetricsButton = document.getElementById('refresh-metrics-button');
  const metricsLastUpdated = document.getElementById('metrics-last-updated');
  const mainTabButtons = document.querySelectorAll('.main-tab-button');
  const tabSections = document.querySelectorAll('.tab-section');
  let currentService = 'jellyfin';
  let currentInterface = '';
  let currentTempType = 'all';
  let charts = {};
  let lastNetworkData = {};
  let temperatureData = { cpu: [], system: [], drives: [], gpu: [] };
  mainTabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      mainTabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      tabSections.forEach(section => {
        section.classList.remove('active');
        if (section.id === `${tabName}-section`) section.classList.add('active');
      });
      if (tabName === 'metrics') {
        fetchMetricsHistory();
        fetchDiskInfo();
      }
    });
  });
  function updateTimestamp(element) {
    const now = new Date();
    element.textContent = `Last updated: ${now.toLocaleTimeString()}`;
  }
  async function fetchLogs(service) {
    logOutput.textContent = 'Loading logs...';
    try {
      const response = await fetch(`/api/logs/${service}`);
      const data = await response.json();
      if (data.error) {
        logOutput.textContent = `Error: ${data.error}`;
        return;
      }
      logOutput.textContent = data.logs || 'No logs available';
      logOutput.scrollTop = logOutput.scrollHeight;
      updateTimestamp(lastUpdated);
    } catch (error) {
      logOutput.textContent = `Error fetching logs: ${error.message}`;
    }
  }
  fetchLogs(currentService);
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      currentService = button.dataset.service;
      fetchLogs(currentService);
    });
  });
  refreshButton.addEventListener('click', () => fetchLogs(currentService));
  setInterval(() => {
    if (document.getElementById('logs-section').classList.contains('active')) {
      fetchLogs(currentService);
    }
  }, 30000);
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  function formatSpeed(bytesPerSecond, decimals = 2) {
    if (bytesPerSecond === 0) return '0 KB/s';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  function calculateRates(current, previous) {
    const result = {};
    if (!previous || Object.keys(previous).length === 0) return null;
    for (const [interfaceName, interfaceData] of Object.entries(current)) {
      if (previous[interfaceName] && 
          interfaceData.rx_bytes && interfaceData.rx_bytes.length > 0 &&
          previous[interfaceName].rx_bytes && previous[interfaceName].rx_bytes.length > 0) {
        const latestCurrentRx = interfaceData.rx_bytes[interfaceData.rx_bytes.length - 1];
        const latestCurrentTx = interfaceData.tx_bytes[interfaceData.tx_bytes.length - 1];
        const latestPreviousRx = previous[interfaceName].rx_bytes[previous[interfaceName].rx_bytes.length - 1];
        const latestPreviousTx = previous[interfaceName].tx_bytes[previous[interfaceName].tx_bytes.length - 1];
        if (!latestCurrentRx || !latestCurrentTx || !latestPreviousRx || !latestPreviousTx) continue;
        const timeDiff = (latestCurrentRx.timestamp - latestPreviousRx.timestamp) / 1000;
        if (timeDiff > 0) {
          const rxDiff = latestCurrentRx.value - latestPreviousRx.value;
          const txDiff = latestCurrentTx.value - latestPreviousTx.value;
          result[interfaceName] = {
            rx_rate: rxDiff / timeDiff,
            tx_rate: txDiff / timeDiff
          };
        }
      }
    }
    return result;
  }
  function initCharts() {
    charts.cpu = new Chart(cpuChart, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'CPU Usage (%)',
          data: [],
          borderColor: '#007acc',
          backgroundColor: 'rgba(0, 122, 204, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          },
          x: {
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          }
        },
        plugins: {
          legend: { labels: { color: '#e0e0e0' } }
        }
      }
    });
    charts.memory = new Chart(memoryChart, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Memory Usage (%)',
          data: [],
          borderColor: '#4caf50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          },
          x: {
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          }
        },
        plugins: {
          legend: { labels: { color: '#e0e0e0' } }
        }
      }
    });
    charts.network = new Chart(networkChart, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Download (RX)',
            data: [],
            borderColor: '#f44336',
            backgroundColor: 'rgba(244, 67, 54, 0.1)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Upload (TX)',
            data: [],
            borderColor: '#ff9800',
            backgroundColor: 'rgba(255, 152, 0, 0.1)',
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            ticks: {
              color: '#aaa',
              callback: function(value) { return formatSpeed(value, 0); }
            },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          },
          x: {
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          }
        },
        plugins: {
          legend: { labels: { color: '#e0e0e0' } },
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                return label + formatSpeed(context.raw);
              }
            }
          }
        }
      }
    });
    charts.temperature = new Chart(temperatureChart, {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: '#aaa',
              callback: function(value) { return value + '°C'; }
            },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          },
          x: {
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: '#e0e0e0' }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                return label + context.raw + '°C';
              }
            }
          }
        }
      }
    });
  }
  async function fetchNetworkInterfaces() {
    try {
      const response = await fetch('/api/metrics/network');
      const data = await response.json();
      if (data.error) {
        console.error(`Error: ${data.error}`);
        return;
      }
      interfaceSelect.innerHTML = '';
      if (data.interfaces && data.interfaces.length > 0) {
        data.interfaces.forEach(iface => {
          const option = document.createElement('option');
          option.value = iface.interface;
          option.textContent = iface.interface;
          interfaceSelect.appendChild(option);
        });
        if (!currentInterface && interfaceSelect.options.length > 0) {
          currentInterface = interfaceSelect.options[0].value;
        }
      }
    } catch (error) {
      console.error(`Error fetching network interfaces: ${error.message}`);
    }
  }
  async function fetchMetricsHistory() {
    try {
      const response = await fetch('/api/metrics/history');
      const data = await response.json();
      if (!data) {
        console.error('No metrics data received');
        return;
      }
      const networkRates = calculateRates(data.network, lastNetworkData);
      if (data.network) lastNetworkData = JSON.parse(JSON.stringify(data.network));
      if (data.cpu && data.cpu.length > 0) updateCpuChart(data.cpu);
      if (data.memory && data.memory.length > 0) updateMemoryChart(data.memory);
      if (currentInterface && data.network && data.network[currentInterface]) {
        updateNetworkChart(data.network[currentInterface], networkRates);
      }
      fetchTemperatureData();
      updateTimestamp(metricsLastUpdated);
    } catch (error) {
      console.error(`Error fetching metrics history: ${error.message}`);
    }
  }
  function updateCpuChart(cpuData) {
    if (!cpuData || !cpuData.length) return;
    const labels = cpuData.map(point => new Date(point.timestamp).toLocaleTimeString());
    const values = cpuData.map(point => point.value);
    charts.cpu.data.labels = labels;
    charts.cpu.data.datasets[0].data = values;
    charts.cpu.update();
    const currentCpu = values[values.length - 1];
    document.getElementById('cpu-current').textContent = `Current: ${currentCpu.toFixed(2)}%`;
    const avgCpu = values.reduce((sum, val) => sum + val, 0) / values.length;
    document.getElementById('cpu-avg').textContent = `Average: ${avgCpu.toFixed(2)}%`;
  }
  function updateMemoryChart(memoryData) {
    if (!memoryData || !memoryData.length) return;
    const labels = memoryData.map(point => new Date(point.timestamp).toLocaleTimeString());
    const values = memoryData.map(point => point.value);
    charts.memory.data.labels = labels;
    charts.memory.data.datasets[0].data = values;
    charts.memory.update();
    const currentMemory = values[values.length - 1];
    document.getElementById('memory-current').textContent = `Current: ${currentMemory.toFixed(2)}%`;
    fetch('/api/metrics/memory')
      .then(response => response.json())
      .then(data => {
        if (data && data.total) {
          document.getElementById('memory-total').textContent = `Total: ${formatBytes(data.total)}`;
        }
      })
      .catch(error => console.error(`Error fetching memory info: ${error.message}`));
  }
  function updateNetworkChart(networkData, networkRates) {
    if (!networkData || !networkData.rx_bytes || !networkData.tx_bytes) return;
    const rxData = networkData.rx_bytes;
    const txData = networkData.tx_bytes;
    if (!rxData || !rxData.length || !txData || !txData.length) return;
    const labels = rxData.map(point => new Date(point.timestamp).toLocaleTimeString());
    const rxRates = [];
    const txRates = [];
    for (let i = 1; i < rxData.length; i++) {
      const timeDiff = (rxData[i].timestamp - rxData[i-1].timestamp) / 1000;
      if (timeDiff > 0) {
        const rxDiff = rxData[i].value - rxData[i-1].value;
        const txDiff = txData[i].value - txData[i-1].value;
        rxRates.push(rxDiff / timeDiff);
        txRates.push(txDiff / timeDiff);
      } else {
        rxRates.push(0);
        txRates.push(0);
      }
    }
    rxRates.unshift(0);
    txRates.unshift(0);
    if (labels.length < rxRates.length) {
      const diff = rxRates.length - labels.length;
      for (let i = 0; i < diff; i++) labels.unshift('-');
    }
    charts.network.data.labels = labels;
    charts.network.data.datasets[0].data = rxRates;
    charts.network.data.datasets[1].data = txRates;
    charts.network.update();
    if (networkRates && networkRates[currentInterface]) {
      const rates = networkRates[currentInterface];
      document.getElementById('network-rx').textContent = `Download: ${formatSpeed(rates.rx_rate)}`;
      document.getElementById('network-tx').textContent = `Upload: ${formatSpeed(rates.tx_rate)}`;
    } else {
      const lastRxRate = rxRates[rxRates.length - 1] || 0;
      const lastTxRate = txRates[txRates.length - 1] || 0;
      document.getElementById('network-rx').textContent = `Download: ${formatSpeed(lastRxRate)}`;
      document.getElementById('network-tx').textContent = `Upload: ${formatSpeed(lastTxRate)}`;
    }
  }
  async function fetchDiskInfo() {
    try {
      const disksContainer = document.getElementById('disks-container');
      disksContainer.innerHTML = '<div class="loading-spinner">Loading drive information...</div>';
      const response = await fetch('/api/metrics/disks');
      const data = await response.json();
      if (data.error) {
        disksContainer.innerHTML = `<div class="alert">Error: ${data.error}</div>`;
        return;
      }
      if (!data.disks || data.disks.length === 0) {
        disksContainer.innerHTML = '<div class="alert">No disk information available</div>';
        return;
      }
      disksContainer.innerHTML = '';
      const filteredDisks = data.disks.filter(disk => {
        const isDrive = disk.name.startsWith('sd') || disk.name.startsWith('nvme');
        const isNotUdev = !disk.name.includes('udev') && !disk.devicePath.includes('udev');
        return isDrive && isNotUdev;
      });
      filteredDisks.forEach(disk => {
        const diskCard = document.createElement('div');
        diskCard.className = 'disk-card';
        const isSSD = disk.model.toLowerCase().includes('ssd') || 
                      disk.name.includes('nvme') || 
                      (disk.smart && disk.smart.ssdLifeLeft !== null);
        const diskTypeText = isSSD ? 'SSD' : 'HDD';
        let diskHeader = `
          <div class="disk-header">
            <div class="disk-name">${disk.name}</div>
            <div class="disk-type ${isSSD ? 'ssd' : 'hdd'}">${diskTypeText}</div>
          </div>
        `;
        let diskContent = '<div class="disk-content">';
        diskContent += `<div>${disk.model} (${disk.size})</div>`;
        if (disk.usage && disk.usage.partitions && disk.usage.partitions.length > 0) {
          const partition = disk.usage.partitions[disk.usage.partitions.length - 1];
          const usedPercent = parseInt(partition.percentage, 10);
          const usageClass = usedPercent > 90 ? 'critical' : (usedPercent > 75 ? 'warning' : '');
          diskContent += `
            <div class="disk-partition">
              <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                <span>${partition.percentage} used (${partition.used} / ${partition.size})</span>
              </div>
            </div>
          `;
        } else {
          diskContent += '<div>No mountpoint information available</div>';
        }
        diskContent += '<div class="disk-details">';
        diskContent += `<div class="disk-detail-row"><div class="disk-detail-label">Device Path:</div><div>${disk.devicePath}</div></div>`;
        if (disk.smart) {
          if (disk.smart.temperature) {
            diskContent += `<div class="disk-detail-row"><div class="disk-detail-label">Temperature:</div><div>${disk.smart.temperature}°C</div></div>`;
          }
          if (disk.smart.powerOnHours) {
            const days = Math.floor(disk.smart.powerOnHours / 24);
            diskContent += `<div class="disk-detail-row"><div class="disk-detail-label">Power On Time:</div><div>${disk.smart.powerOnHours} hours (${days} days)</div></div>`;
          }
          if (isSSD && disk.smart.ssdLifeLeft !== null) {
            const healthStatus = disk.smart.ssdLifeLeft > 50 ? 'good' : (disk.smart.ssdLifeLeft > 20 ? 'warning' : 'critical');
            diskContent += `
              <div class="disk-smart-health">
                <div class="disk-smart-health-title">SSD Health</div>
                <div><span class="health-indicator ${healthStatus}"></span> ${disk.smart.ssdLifeLeft}% life remaining</div>
              </div>
            `;
          } else if (disk.smart.reallocatedSectors !== null) {
            const healthStatus = disk.smart.reallocatedSectors === 0 ? 'good' : (disk.smart.reallocatedSectors < 10 ? 'warning' : 'critical');
            diskContent += `
              <div class="disk-smart-health">
                <div class="disk-smart-health-title">Drive Health</div>
                <div><span class="health-indicator ${healthStatus}"></span> ${disk.smart.reallocatedSectors} reallocated sectors</div>
              </div>
            `;
          }
        }
        diskContent += '</div></div>';
        diskCard.innerHTML = diskHeader + diskContent;
        disksContainer.appendChild(diskCard);
      });
    } catch (error) {
      const disksContainer = document.getElementById('disks-container');
      disksContainer.innerHTML = `<div class="alert">Error fetching disk information: ${error.message}</div>`;
    }
  }
  async function fetchTemperatureData() {
    try {
      const response = await fetch('/api/metrics/temperature');
      const data = await response.json();
      if (data.error) {
        tempNotAvailable.style.display = 'block';
        if (data.instructions) {
          tempNotAvailable.innerHTML = `<p>${data.error}</p><pre>${data.instructions}</pre>`;
        }
        return;
      }
      tempNotAvailable.style.display = 'none';
      temperatureData = data;
      updateTemperatureChart();
      updateTemperatureCategories();
      if (data.cpu && data.cpu.length > 0) {
        const maxCpuTemp = Math.max(...data.cpu.map(item => item.value));
        document.getElementById('temp-info').textContent = `CPU Temperature: ${maxCpuTemp.toFixed(1)}°C`;
        updateBackgroundColor(maxCpuTemp);
      }
    } catch (error) {
      tempNotAvailable.style.display = 'block';
      tempNotAvailable.innerHTML = '<p>Error fetching temperature data. Please check if temperature monitoring tools are installed.</p>';
    }
  }
  function updateTemperatureChart() {
    if (!temperatureData) return;
    let maxCpuTemp = 40;
    if (temperatureData.cpu && temperatureData.cpu.length > 0) {
      maxCpuTemp = Math.max(...temperatureData.cpu.map(item => item.value));
    }
    updateBackgroundColor(maxCpuTemp);
    let labels = [];
    let datasets = [];
    if (currentTempType === 'all' || currentTempType === 'cpu') {
      if (temperatureData.cpu && temperatureData.cpu.length > 0) {
        const cpuData = temperatureData.cpu.map(item => item.value);
        const cpuLabels = temperatureData.cpu.map(item => item.name);
        if (cpuData.length > 0) {
          labels = [...labels, ...cpuLabels];
          datasets.push({
            label: 'CPU',
            data: cpuData,
            backgroundColor: 'rgba(244, 67, 54, 0.7)',
            borderColor: '#f44336',
            borderWidth: 1
          });
        }
      }
    }
    if (currentTempType === 'all' || currentTempType === 'gpu') {
      if (temperatureData.gpu && temperatureData.gpu.length > 0) {
        const gpuData = temperatureData.gpu.map(item => item.value);
        const gpuLabels = temperatureData.gpu.map(item => item.name);
        if (gpuData.length > 0) {
          labels = [...labels, ...gpuLabels];
          datasets.push({
            label: 'GPU',
            data: gpuData,
            backgroundColor: 'rgba(255, 152, 0, 0.7)',
            borderColor: '#ff9800',
            borderWidth: 1
          });
        }
      }
    }
    if (currentTempType === 'all' || currentTempType === 'system') {
      if (temperatureData.system && temperatureData.system.length > 0) {
        const systemData = temperatureData.system.map(item => item.value);
        const systemLabels = temperatureData.system.map(item => item.name);
        if (systemData.length > 0) {
          labels = [...labels, ...systemLabels];
          datasets.push({
            label: 'System',
            data: systemData,
            backgroundColor: 'rgba(33, 150, 243, 0.7)',
            borderColor: '#2196f3',
            borderWidth: 1
          });
        }
      }
    }
    if (currentTempType === 'all' || currentTempType === 'drives') {
      if (temperatureData.drives && temperatureData.drives.length > 0) {
        const driveData = temperatureData.drives.map(item => item.value);
        const driveLabels = temperatureData.drives.map(item => item.name);
        if (driveData.length > 0) {
          labels = [...labels, ...driveLabels];
          datasets.push({
            label: 'Drives',
            data: driveData,
            backgroundColor: 'rgba(76, 175, 80, 0.7)',
            borderColor: '#4caf50',
            borderWidth: 1
          });
        }
      }
    }
    charts.temperature.data.labels = labels;
    charts.temperature.data.datasets = datasets;
    charts.temperature.update();
    let totalComponents = 0;
    let maxTemp = 0;
    let maxTempName = '';
    if (currentTempType === 'all' || currentTempType === 'cpu') {
      if (temperatureData.cpu) {
        totalComponents += temperatureData.cpu.length;
        temperatureData.cpu.forEach(item => {
          if (item.value > maxTemp) {
            maxTemp = item.value;
            maxTempName = item.name;
          }
        });
      }
    }
    if (currentTempType === 'all' || currentTempType === 'gpu') {
      if (temperatureData.gpu) {
        totalComponents += temperatureData.gpu.length;
        temperatureData.gpu.forEach(item => {
          if (item.value > maxTemp) {
            maxTemp = item.value;
            maxTempName = item.name;
          }
        });
      }
    }
    if (currentTempType === 'all' || currentTempType === 'system') {
      if (temperatureData.system) {
        totalComponents += temperatureData.system.length;
        temperatureData.system.forEach(item => {
          if (item.value > maxTemp) {
            maxTemp = item.value;
            maxTempName = item.name;
          }
        });
      }
    }
    if (currentTempType === 'all' || currentTempType === 'drives') {
      if (temperatureData.drives) {
        totalComponents += temperatureData.drives.length;
        temperatureData.drives.forEach(item => {
          if (item.value > maxTemp) {
            maxTemp = item.value;
            maxTempName = item.name;
          }
        });
      }
    }
    document.getElementById('temp-info').textContent = `Components: ${totalComponents}`;
    document.getElementById('temp-max').textContent = maxTemp > 0 ? 
      `Max Temperature: ${maxTemp.toFixed(1)}°C (${maxTempName})` : 
      'Max Temperature: -';
  }
  function updateTemperatureCategories() {
    const tempCategoryContainer = document.getElementById('temperature-categories');
    if (!tempCategoryContainer) return;
    tempCategoryContainer.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'temperature-grid';
    if (temperatureData.cpu && temperatureData.cpu.length > 0) {
      const cpuCategory = document.createElement('div');
      cpuCategory.className = 'temperature-category cpu';
      let cpuHtml = '<h4>CPU Temperatures</h4>';
      let maxTemp = 0;
      let maxTempName = '';
      temperatureData.cpu.forEach(item => {
        const tempClass = item.value > 80 ? 'critical' : (item.value > 70 ? 'warning' : '');
        cpuHtml += `
          <div class="temperature-item">
            <div class="temperature-name">${item.name}</div>
            <div class="temperature-value ${tempClass}">${item.value.toFixed(1)}°C</div>
          </div>
        `;
        if (item.value > maxTemp) {
          maxTemp = item.value;
          maxTempName = item.name;
        }
      });
      if (maxTemp > 0) {
        const maxTempClass = maxTemp > 80 ? 'critical' : (maxTemp > 70 ? 'warning' : '');
        cpuHtml += `
          <div class="temperature-item" style="margin-top: 10px; border-top: 1px solid var(--border-color); padding-top: 10px;">
            <div class="temperature-name">Max Temperature</div>
            <div class="temperature-value ${maxTempClass}">${maxTemp.toFixed(1)}°C (${maxTempName})</div>
          </div>
        `;
      }
      cpuCategory.innerHTML = cpuHtml;
      grid.appendChild(cpuCategory);
    }
    if (temperatureData.gpu && temperatureData.gpu.length > 0) {
      const gpuCategory = document.createElement('div');
      gpuCategory.className = 'temperature-category gpu';
      let gpuHtml = '<h4>GPU Temperatures</h4>';
      temperatureData.gpu.forEach(item => {
        const tempClass = item.value > 85 ? 'critical' : (item.value > 75 ? 'warning' : '');
        gpuHtml += `
          <div class="temperature-item">
            <div class="temperature-name">${item.name}</div>
            <div class="temperature-value ${tempClass}">${item.value.toFixed(1)}°C</div>
          </div>
        `;
      });
      gpuCategory.innerHTML = gpuHtml;
      grid.appendChild(gpuCategory);
    }
    if (temperatureData.system && temperatureData.system.length > 0) {
      const systemCategory = document.createElement('div');
      systemCategory.className = 'temperature-category system';
      let systemHtml = '<h4>System Temperatures</h4>';
      temperatureData.system.forEach(item => {
        const tempClass = item.value > 70 ? 'critical' : (item.value > 60 ? 'warning' : '');
        systemHtml += `
          <div class="temperature-item">
            <div class="temperature-name">${item.name}</div>
            <div class="temperature-value ${tempClass}">${item.value.toFixed(1)}°C</div>
          </div>
        `;
      });
      systemCategory.innerHTML = systemHtml;
      grid.appendChild(systemCategory);
    }
    if (temperatureData.drives && temperatureData.drives.length > 0) {
      const driveCategory = document.createElement('div');
      driveCategory.className = 'temperature-category drive';
      let driveHtml = '<h4>Drive Temperatures</h4>';
      temperatureData.drives.forEach(item => {
        const tempClass = item.value > 55 ? 'critical' : (item.value > 45 ? 'warning' : '');
        driveHtml += `
          <div class="temperature-item">
            <div class="temperature-name">${item.name}</div>
            <div class="temperature-value ${tempClass}">${item.value.toFixed(1)}°C</div>
          </div>
        `;
      });
      driveCategory.innerHTML = driveHtml;
      grid.appendChild(driveCategory);
    }
    tempCategoryContainer.appendChild(grid);
  }
  function updateBackgroundColor(temperature) {
    console.log('Would update background with temperature:', temperature);
  }
  interfaceSelect.addEventListener('change', () => {
    currentInterface = interfaceSelect.value;
    fetchMetricsHistory();
  });
  tempTypeSelect.addEventListener('change', () => {
    currentTempType = tempTypeSelect.value;
    updateTemperatureChart();
  });
  refreshMetricsButton.addEventListener('click', () => {
    fetchMetricsHistory();
    fetchDiskInfo();
  });
  initCharts();
  fetchNetworkInterfaces();
  fetchMetricsHistory();
  fetchDiskInfo();
  setInterval(() => {
    if (document.getElementById('metrics-section').classList.contains('active')) {
      fetchMetricsHistory();
      fetchDiskInfo();
    }
  }, 30000);
});