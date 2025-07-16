document.addEventListener('DOMContentLoaded', () => {
    let isAuthenticated = false;
    let currentPanel = 'overview';
    let charts = {};
    let currentInterface = '';
    let currentTempType = 'all';
    let lastNetworkData = {};
    let temperatureData = { cpu: [], system: [], drives: [], gpu: [] };
    let refreshInterval = 30000;
    let autoRefreshEnabled = true;
    let refreshTimer;

    const authButton = document.getElementById('auth-button');
    const authStatus = document.getElementById('auth-status');
    const authModal = document.getElementById('authModal');
    const authForm = document.getElementById('authForm');

    function toggleSection(header) {
        header.classList.toggle('expanded');
        const items = header.nextElementSibling;
        items.classList.toggle('expanded');
    }

    function showPanel(panelId) {
        document.querySelectorAll('.content-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.add('active');
        }
        
        event.target.classList.add('active');
        currentPanel = panelId;
        
        const logPanels = ['jellyfin', 'sonarr', 'prowlarr', 'radarr', 'transmission', 'fail2ban', 'netdata', 'unify'];
        
        if (logPanels.includes(panelId)) {
            if (isAuthenticated) {
                panel.classList.add('authenticated');
                loadLogs(panelId);
            } else {
                panel.classList.remove('authenticated');
                showAuthModal();
            }
        } else {
            switch(panelId) {
                case 'overview':
                case 'cpu':
                case 'memory':
                case 'network':
                case 'storage':
                case 'temperature':
                    loadMetrics();
                    break;
            }
        }
    }

    function showAuthModal() {
        authModal.style.display = 'flex';
    }

    function closeAuthModal() {
        authModal.style.display = 'none';
    }

    function authenticate(username, password) {
        if (username === 'penguin' && password === 'penguin') {
            isAuthenticated = true;
            authStatus.textContent = 'Authenticated';
            authButton.textContent = 'Logout';
            authButton.className = 'btn btn-danger';
            closeAuthModal();
            
            document.querySelectorAll('.log-panel').forEach(panel => {
                panel.classList.add('authenticated');
            });
            
            if (['jellyfin', 'sonarr', 'prowlarr', 'radarr', 'transmission', 'fail2ban', 'netdata', 'unify'].includes(currentPanel)) {
                loadLogs(currentPanel);
            }
            
            return true;
        }
        return false;
    }

    function logout() {
        isAuthenticated = false;
        authStatus.textContent = 'Not authenticated';
        authButton.textContent = 'Login';
        authButton.className = 'btn btn-secondary';
        
        document.querySelectorAll('.log-panel').forEach(panel => {
            panel.classList.remove('authenticated');
        });
        
        showPanel('overview');
    }

    authButton.addEventListener('click', () => {
        if (isAuthenticated) {
            logout();
        } else {
            showAuthModal();
        }
    });

    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        if (authenticate(username, password)) {
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
        } else {
            alert('Invalid credentials');
        }
    });

    authModal.addEventListener('click', (e) => {
        if (e.target === authModal) {
            closeAuthModal();
        }
    });

    async function fetchLogs(service) {
        try {
            const response = await fetch(`/api/logs/${service}`);
            const data = await response.json();
            return data.error ? `Error: ${data.error}` : data.logs || 'No logs available';
        } catch (error) {
            return `Error fetching logs: ${error.message}`;
        }
    }

    async function loadLogs(service) {
        if (!isAuthenticated) return;
        
        const outputElement = document.getElementById(`${service}-log-output`);
        if (outputElement) {
            outputElement.textContent = 'Loading logs...';
            const serviceName = service === 'transmission' ? 'transmission-daemon' : service;
            const logs = await fetchLogs(serviceName);
            outputElement.textContent = logs;
            outputElement.scrollTop = outputElement.scrollHeight;
        }
    }

    function refreshLogs(service) {
        loadLogs(service);
    }

    async function fetchMetricsHistory() {
        try {
            const response = await fetch('/api/metrics/history');
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch metrics:', error);
            return null;
        }
    }

    async function fetchNetworkInterfaces() {
        try {
            const response = await fetch('/api/metrics/network');
            const data = await response.json();
            
            if (data.error) {
                console.error(`Error: ${data.error}`);
                return;
            }

            const interfaceSelect = document.getElementById('interface-select');
            if (interfaceSelect && data.interfaces && data.interfaces.length > 0) {
                interfaceSelect.innerHTML = '';
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

    async function fetchTemperatureData() {
        try {
            const response = await fetch('/api/metrics/temperature');
            const data = await response.json();
            
            if (data.error) {
                const tempNotAvailable = document.getElementById('temp-not-available');
                if (tempNotAvailable) {
                    tempNotAvailable.style.display = 'block';
                    if (data.instructions) {
                        tempNotAvailable.innerHTML = `<p>${data.error}</p><pre>${data.instructions}</pre>`;
                    }
                }
                return null;
            }
            
            const tempNotAvailable = document.getElementById('temp-not-available');
            if (tempNotAvailable) {
                tempNotAvailable.style.display = 'none';
            }
            
            temperatureData = data;
            return data;
        } catch (error) {
            console.error('Error fetching temperature data:', error);
            return null;
        }
    }

    async function fetchDiskInfo() {
        try {
            const response = await fetch('/api/metrics/disks');
            const data = await response.json();
            
            if (data.error) {
                return { error: data.error };
            }
            
            return data;
        } catch (error) {
            console.error('Error fetching disk info:', error);
            return { error: error.message };
        }
    }

    function initCharts() {
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
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
        };

        const cpuChartElement = document.getElementById('cpu-chart');
        if (cpuChartElement) {
            charts.cpu = new Chart(cpuChartElement, {
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
                options: { ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, max: 100 } } }
            });
        }

        const overviewCpuChartElement = document.getElementById('overview-cpu-chart');
        if (overviewCpuChartElement) {
            charts.overviewCpu = new Chart(overviewCpuChartElement, {
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
                options: { ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, max: 100 } } }
            });
        }

        const memoryChartElement = document.getElementById('memory-chart');
        if (memoryChartElement) {
            charts.memory = new Chart(memoryChartElement, {
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
                options: { ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, max: 100 } } }
            });
        }

        const overviewMemoryChartElement = document.getElementById('overview-memory-chart');
        if (overviewMemoryChartElement) {
            charts.overviewMemory = new Chart(overviewMemoryChartElement, {
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
                options: { ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, max: 100 } } }
            });
        }

        const networkChartElement = document.getElementById('network-chart');
        if (networkChartElement) {
            charts.network = new Chart(networkChartElement, {
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
                    ...chartOptions,
                    scales: {
                        ...chartOptions.scales,
                        y: {
                            ...chartOptions.scales.y,
                            ticks: {
                                ...chartOptions.scales.y.ticks,
                                callback: function(value) {
                                    return formatSpeed(value, 0);
                                }
                            }
                        }
                    },
                    plugins: {
                        ...chartOptions.plugins,
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
        }

        const temperatureChartElement = document.getElementById('temperature-chart');
        if (temperatureChartElement) {
            charts.temperature = new Chart(temperatureChartElement, {
                type: 'bar',
                data: { labels: [], datasets: [] },
                options: {
                    ...chartOptions,
                    scales: {
                        ...chartOptions.scales,
                        y: {
                            ...chartOptions.scales.y,
                            ticks: {
                                ...chartOptions.scales.y.ticks,
                                callback: function(value) {
                                    return value + '°C';
                                }
                            }
                        }
                    },
                    plugins: {
                        ...chartOptions.plugins,
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
    }

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

    function formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    function updateOverviewStats(data) {
        if (!data) return;

        const systemUptimeElement = document.getElementById('system-uptime');
        const cpuUsageElement = document.getElementById('cpu-usage');
        const memoryUsageElement = document.getElementById('memory-usage');
        const networkActivityElement = document.getElementById('network-activity');

        if (systemUptimeElement && data.uptime) {
            systemUptimeElement.textContent = formatUptime(data.uptime);
        }

        if (cpuUsageElement && data.cpu && data.cpu.length > 0) {
            const latestCpu = data.cpu[data.cpu.length - 1].value;
            cpuUsageElement.textContent = `${latestCpu.toFixed(1)}%`;
        }

        if (memoryUsageElement && data.memory && data.memory.length > 0) {
            const latestMemory = data.memory[data.memory.length - 1].value;
            memoryUsageElement.textContent = `${latestMemory.toFixed(1)}%`;
        }

        if (networkActivityElement && data.network && currentInterface && data.network[currentInterface]) {
            const networkData = data.network[currentInterface];
            if (networkData.rx_bytes && networkData.rx_bytes.length > 1) {
                const latest = networkData.rx_bytes[networkData.rx_bytes.length - 1];
                const previous = networkData.rx_bytes[networkData.rx_bytes.length - 2];
                const timeDiff = (latest.timestamp - previous.timestamp) / 1000;
                if (timeDiff > 0) {
                    const rxRate = (latest.value - previous.value) / timeDiff;
                    networkActivityElement.textContent = formatSpeed(rxRate);
                }
            }
        }
    }

    function updateCharts(data) {
        if (!data) return;

        if (data.cpu && data.cpu.length > 0) {
            const labels = data.cpu.map(point => new Date(point.timestamp).toLocaleTimeString());
            const values = data.cpu.map(point => point.value);

            if (charts.cpu) {
                charts.cpu.data.labels = labels;
                charts.cpu.data.datasets[0].data = values;
                charts.cpu.update();

                const currentCpu = values[values.length - 1];
                const avgCpu = values.reduce((sum, val) => sum + val, 0) / values.length;
                
                const cpuCurrentElement = document.getElementById('cpu-current');
                const cpuAvgElement = document.getElementById('cpu-avg');
                
                if (cpuCurrentElement) cpuCurrentElement.textContent = `Current: ${currentCpu.toFixed(2)}%`;
                if (cpuAvgElement) cpuAvgElement.textContent = `Average: ${avgCpu.toFixed(2)}%`;
            }

            if (charts.overviewCpu) {
                charts.overviewCpu.data.labels = labels.slice(-10);
                charts.overviewCpu.data.datasets[0].data = values.slice(-10);
                charts.overviewCpu.update();
            }
        }

        if (data.memory && data.memory.length > 0) {
            const labels = data.memory.map(point => new Date(point.timestamp).toLocaleTimeString());
            const values = data.memory.map(point => point.value);

            if (charts.memory) {
                charts.memory.data.labels = labels;
                charts.memory.data.datasets[0].data = values;
                charts.memory.update();

                const currentMemory = values[values.length - 1];
                const memoryCurrentElement = document.getElementById('memory-current');
                if (memoryCurrentElement) {
                    memoryCurrentElement.textContent = `Current: ${currentMemory.toFixed(2)}%`;
                }
            }

            if (charts.overviewMemory) {
                charts.overviewMemory.data.labels = labels.slice(-10);
                charts.overviewMemory.data.datasets[0].data = values.slice(-10);
                charts.overviewMemory.update();
            }
        }

        if (currentInterface && data.network && data.network[currentInterface] && charts.network) {
            const networkData = data.network[currentInterface];
            const rxData = networkData.rx_bytes;
            const txData = networkData.tx_bytes;

            if (rxData && rxData.length > 0 && txData && txData.length > 0) {
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

                charts.network.data.labels = labels;
                charts.network.data.datasets[0].data = rxRates;
                charts.network.data.datasets[1].data = txRates;
                charts.network.update();

                const lastRxRate = rxRates[rxRates.length - 1] || 0;
                const lastTxRate = txRates[txRates.length - 1] || 0;
                
                const networkRxElement = document.getElementById('network-rx');
                const networkTxElement = document.getElementById('network-tx');
                
                if (networkRxElement) networkRxElement.textContent = `Download: ${formatSpeed(lastRxRate)}`;
                if (networkTxElement) networkTxElement.textContent = `Upload: ${formatSpeed(lastTxRate)}`;
            }
        }
    }

    function updateTemperatureChart() {
        if (!temperatureData || !charts.temperature) return;

        let labels = [];
        let datasets = [];

        if (currentTempType === 'all' || currentTempType === 'cpu') {
            if (temperatureData.cpu && temperatureData.cpu.length > 0) {
                const cpuData = temperatureData.cpu.map(item => item.value);
                const cpuLabels = temperatureData.cpu.map(item => item.name);
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

        if (currentTempType === 'all' || currentTempType === 'gpu') {
            if (temperatureData.gpu && temperatureData.gpu.length > 0) {
                const gpuData = temperatureData.gpu.map(item => item.value);
                const gpuLabels = temperatureData.gpu.map(item => item.name);
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

        if (currentTempType === 'all' || currentTempType === 'system') {
            if (temperatureData.system && temperatureData.system.length > 0) {
                const systemData = temperatureData.system.map(item => item.value);
                const systemLabels = temperatureData.system.map(item => item.name);
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

        if (currentTempType === 'all' || currentTempType === 'drives') {
            if (temperatureData.drives && temperatureData.drives.length > 0) {
                const driveData = temperatureData.drives.map(item => item.value);
                const driveLabels = temperatureData.drives.map(item => item.name);
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

        charts.temperature.data.labels = labels;
        charts.temperature.data.datasets = datasets;
        charts.temperature.update();

        let totalComponents = 0;
        let maxTemp = 0;
        let maxTempName = '';

        ['cpu', 'gpu', 'system', 'drives'].forEach(type => {
            if ((currentTempType === 'all' || currentTempType === type) && temperatureData[type]) {
                totalComponents += temperatureData[type].length;
                temperatureData[type].forEach(item => {
                    if (item.value > maxTemp) {
                        maxTemp = item.value;
                        maxTempName = item.name;
                    }
                });
            }
        });

        const tempInfoElement = document.getElementById('temp-info');
        const tempMaxElement = document.getElementById('temp-max');
        
        if (tempInfoElement) tempInfoElement.textContent = `Components: ${totalComponents}`;
        if (tempMaxElement) {
            tempMaxElement.textContent = maxTemp > 0 ? 
                `Max Temperature: ${maxTemp.toFixed(1)}°C (${maxTempName})` : 
                'Max Temperature: -';
        }
    }

    function updateTemperatureCategories() {
        const tempCategoryContainer = document.getElementById('temperature-categories');
        if (!tempCategoryContainer || !temperatureData) return;

        tempCategoryContainer.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'temperature-grid';

        ['cpu', 'gpu', 'system', 'drives'].forEach(type => {
            if (temperatureData[type] && temperatureData[type].length > 0) {
                const category = document.createElement('div');
                category.className = `temperature-category ${type}`;
                
                const typeNames = {
                    cpu: 'CPU Temperatures',
                    gpu: 'GPU Temperatures', 
                    system: 'System Temperatures',
                    drives: 'Drive Temperatures'
                };
                
                let html = `<h4>${typeNames[type]}</h4>`;
                
                temperatureData[type].forEach(item => {
                    const tempClass = item.value > (type === 'drives' ? 55 : type === 'gpu' ? 85 : 80) ? 'critical' : 
                                     (item.value > (type === 'drives' ? 45 : type === 'gpu' ? 75 : 70) ? 'warning' : '');
                    html += `
                        <div class="temperature-item">
                            <div class="temperature-name">${item.name}</div>
                            <div class="temperature-value ${tempClass}">${item.value.toFixed(1)}°C</div>
                        </div>
                    `;
                });
                
                category.innerHTML = html;
                grid.appendChild(category);
            }
        });

        tempCategoryContainer.appendChild(grid);
    }

    async function updateDiskInfo() {
        const disksContainer = document.getElementById('disks-container');
        if (!disksContainer) return;

        disksContainer.innerHTML = '<div class="loading-spinner">Loading drive information...</div>';
        
        const data = await fetchDiskInfo();
        
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
            
            let diskHTML = `
                <div class="disk-header">
                    <div class="disk-name">${disk.name}</div>
                    <div class="disk-type ${isSSD ? 'ssd' : 'hdd'}">${diskTypeText}</div>
                </div>
                <div class="disk-content">
                    <div>${disk.model} (${disk.size})</div>
            `;
            
            if (disk.usage && disk.usage.partitions && disk.usage.partitions.length > 0) {
                const partition = disk.usage.partitions[disk.usage.partitions.length - 1];
                diskHTML += `
                    <div class="disk-partition">
                        <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                            <span>${partition.percentage} used (${partition.used} / ${partition.size})</span>
                        </div>
                    </div>
                `;
            } else {
                diskHTML += '<div>No mountpoint information available</div>';
            }
            
            diskHTML += '<div class="disk-details">';
            diskHTML += `<div class="disk-detail-row"><div class="disk-detail-label">Device Path:</div><div>${disk.devicePath}</div></div>`;
            
            if (disk.smart) {
                if (disk.smart.temperature) {
                    diskHTML += `<div class="disk-detail-row"><div class="disk-detail-label">Temperature:</div><div>${disk.smart.temperature}°C</div></div>`;
                }
                if (disk.smart.powerOnHours) {
                    const days = Math.floor(disk.smart.powerOnHours / 24);
                    diskHTML += `<div class="disk-detail-row"><div class="disk-detail-label">Power On Time:</div><div>${disk.smart.powerOnHours} hours (${days} days)</div></div>`;
                }
                
                if (isSSD && disk.smart.ssdLifeLeft !== null) {
                    const healthStatus = disk.smart.ssdLifeLeft > 50 ? 'good' : (disk.smart.ssdLifeLeft > 20 ? 'warning' : 'critical');
                    diskHTML += `
                        <div class="disk-smart-health">
                            <div class="disk-smart-health-title">SSD Health</div>
                            <div><span class="health-indicator ${healthStatus}"></span> ${disk.smart.ssdLifeLeft}% life remaining</div>
                        </div>
                    `;
                } else if (disk.smart.reallocatedSectors !== null) {
                    const healthStatus = disk.smart.reallocatedSectors === 0 ? 'good' : (disk.smart.reallocatedSectors < 10 ? 'warning' : 'critical');
                    diskHTML += `
                        <div class="disk-smart-health">
                            <div class="disk-smart-health-title">Drive Health</div>
                            <div><span class="health-indicator ${healthStatus}"></span> ${disk.smart.reallocatedSectors} reallocated sectors</div>
                        </div>
                    `;
                }
            }
            
            diskHTML += '</div></div>';
            diskCard.innerHTML = diskHTML;
            disksContainer.appendChild(diskCard);
        });
    }

    async function loadMetrics() {
        const data = await fetchMetricsHistory();
        if (data) {
            updateOverviewStats(data);
            updateCharts(data);
        }
        
        const tempData = await fetchTemperatureData();
        if (tempData) {
            updateTemperatureChart();
            updateTemperatureCategories();
        }
        
        if (currentPanel === 'storage') {
            await updateDiskInfo();
        }
    }

    function resetDashboard() {
        document.getElementById('chartType').value = 'line';
        document.getElementById('updateInterval').value = '30';
        refreshInterval = 30000;
        startAutoRefresh();
    }

    function startAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
        }
        
        if (autoRefreshEnabled) {
            refreshTimer = setInterval(() => {
                if (['overview', 'cpu', 'memory', 'network', 'storage', 'temperature'].includes(currentPanel)) {
                    loadMetrics();
                }
            }, refreshInterval);
        }
    }

    const interfaceSelect = document.getElementById('interface-select');
    if (interfaceSelect) {
        interfaceSelect.addEventListener('change', () => {
            currentInterface = interfaceSelect.value;
            loadMetrics();
        });
    }

    const tempTypeSelect = document.getElementById('temp-type-select');
    if (tempTypeSelect) {
        tempTypeSelect.addEventListener('change', () => {
            currentTempType = tempTypeSelect.value;
            updateTemperatureChart();
        });
    }

    const dashboardConfigForm = document.getElementById('dashboardConfigForm');
    if (dashboardConfigForm) {
        dashboardConfigForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const chartType = document.getElementById('chartType').value;
            const updateInterval = parseInt(document.getElementById('updateInterval').value) * 1000;
            
            refreshInterval = updateInterval;
            startAutoRefresh();
            
            alert('Dashboard settings saved successfully');
        });
    }

    const refreshSettingsForm = document.getElementById('refreshSettingsForm');
    if (refreshSettingsForm) {
        refreshSettingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            autoRefreshEnabled = document.getElementById('autoRefresh').value === 'true';
            refreshInterval = parseInt(document.getElementById('refreshInterval').value) * 1000;
            
            startAutoRefresh();
            alert('Refresh settings saved successfully');
        });
    }

    window.toggleSection = toggleSection;
    window.showPanel = showPanel;
    window.refreshLogs = refreshLogs;
    window.closeAuthModal = closeAuthModal;
    window.resetDashboard = resetDashboard;

    initCharts();
    fetchNetworkInterfaces();
    loadMetrics();
    startAutoRefresh();
});