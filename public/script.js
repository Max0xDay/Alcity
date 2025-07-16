document.addEventListener('DOMContentLoaded', () => {
    let isAuthenticated = false;
    let currentPanel = 'dashboard';
    let charts = {};
    let widgets = [];
    let editMode = false;
    let currentInterface = '';
    let currentTempType = 'all';
    let lastNetworkData = {};
    let temperatureData = { cpu: [], system: [], drives: [], gpu: [] };
    let refreshInterval = 30000;
    let refreshTimer;
    let authTimer;
    let widgetIdCounter = 0;
    let draggedWidget = null;
    let settings = {
        metricsInterval: 30,
        dataRetention: 24,
        cpuSampling: 'average',
        tempUnits: 'celsius',
        historyPoints: 500,
        dataPrecision: 2,
        chartRefresh: 10,
        timeFormat: '24h',
        chartAnimation: 'enabled',
        gridLines: 'enabled',
        timestampDisplay: 'time',
        maxChartPoints: 50,
        performanceMode: 'balanced',
        autoScale: 'enabled',
        cpuWarning: 80,
        cpuCritical: 95,
        memoryWarning: 85,
        memoryCritical: 95,
        tempWarning: 70,
        tempCritical: 85,
        storageWarning: 80,
        storageCritical: 95,
        visualAlerts: 'enabled',
        alertSound: 'disabled',
        defaultInterface: 'auto',
        networkUnits: 'bytes',
        monitorAllInterfaces: 'disabled',
        showInterfaceStats: 'enabled',
        networkPolling: 2,
        bandwidthDetection: 'enabled',
        cpuCoreMonitoring: 'enabled',
        processMonitoring: 'enabled',
        diskIoMonitoring: 'enabled',
        smartMonitoring: 'enabled',
        loadMonitoring: 'enabled',
        serviceMonitoring: 'enabled',
        logLevel: 'info',
        logRotationSize: 50,
        maxLogFiles: 5,
        enableSystemLogging: 'enabled',
        logCompression: 'enabled',
        remoteLogging: 'disabled',
        apiRateLimit: 'medium',
        memoryLimit: 1024,
        dbCleanup: 'daily',
        debugMode: 'disabled',
        autoUpdate: 'disabled',
        experimentalFeatures: 'disabled'
    };

    const authModal = document.getElementById('authModal');
    const authForm = document.getElementById('authForm');
    const widgetModal = document.getElementById('widgetModal');
    const widgetForm = document.getElementById('widgetForm');

    const defaultWidgets = [
        { id: 'cpu-widget', type: 'cpu-overall', chartType: 'line', size: 'medium', title: 'CPU Usage', x: 0, y: 0 },
        { id: 'memory-widget', type: 'memory-usage', chartType: 'area', size: 'medium', title: 'Memory Usage', x: 2, y: 0 },
        { id: 'uptime-widget', type: 'uptime', chartType: 'number', size: 'small', title: 'Uptime', x: 4, y: 0 },
        { id: 'temp-widget', type: 'temperature-cpu', chartType: 'bar', size: 'wide', title: 'CPU Temperature', x: 0, y: 1 },
        { id: 'network-widget', type: 'network-speed', chartType: 'line', size: 'large', title: 'Network Speed', x: 3, y: 1 }
    ];

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
        
        if (logPanels.includes(panelId) || panelId === 'settings') {
            if (isAuthenticated) {
                panel.classList.add('authenticated');
                if (logPanels.includes(panelId)) {
                    loadLogs(panelId);
                } else if (panelId === 'settings') {
                    populateSettingsForm();
                    updateSettingsStatus('Settings loaded successfully');
                }
            } else {
                panel.classList.remove('authenticated');
                showAuthModal();
            }
        } else {
            switch(panelId) {
                case 'dashboard':
                    if (widgets.length === 0) {
                        loadDefaultDashboard();
                    }
                    break;
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

    function showWidgetSelector() {
        widgetModal.style.display = 'flex';
    }

    function closeWidgetModal() {
        widgetModal.style.display = 'none';
    }

    function authenticate(username, password) {
        if (username === 'penguin' && password === 'penguin') {
            isAuthenticated = true;
            closeAuthModal();
            
            document.querySelectorAll('.log-panel, #settings').forEach(panel => {
                panel.classList.add('authenticated');
            });
            
            const restrictedPanels = ['jellyfin', 'sonarr', 'prowlarr', 'radarr', 'transmission', 'fail2ban', 'netdata', 'unify', 'settings'];
            if (restrictedPanels.includes(currentPanel)) {
                const panel = document.getElementById(currentPanel);
                if (panel) {
                    panel.classList.add('authenticated');
                    if (currentPanel === 'settings') {
                        populateSettingsForm();
                        updateSettingsStatus('Settings loaded successfully');
                    } else {
                        loadLogs(currentPanel);
                    }
                }
            }
            
            startAuthTimer();
            return true;
        }
        return false;
    }

    function logout() {
        isAuthenticated = false;
        clearTimeout(authTimer);
        
        document.querySelectorAll('.log-panel, #settings').forEach(panel => {
            panel.classList.remove('authenticated');
        });
        
        showPanel('dashboard');
    }

    function startAuthTimer() {
        clearTimeout(authTimer);
        authTimer = setTimeout(() => {
            logout();
        }, 20 * 60 * 1000);
    }

    function toggleEditMode() {
        editMode = !editMode;
        const dashboardGrid = document.getElementById('dashboard-grid');
        
        if (editMode) {
            dashboardGrid.classList.add('edit-mode-active');
            document.querySelectorAll('.widget').forEach(widget => {
                widget.classList.add('edit-mode');
                widget.draggable = true;
                widget.addEventListener('dragstart', handleDragStart);
                widget.addEventListener('dragover', handleDragOver);
                widget.addEventListener('drop', handleDrop);
                widget.addEventListener('dragend', handleDragEnd);
            });
        } else {
            dashboardGrid.classList.remove('edit-mode-active');
            document.querySelectorAll('.widget').forEach(widget => {
                widget.classList.remove('edit-mode');
                widget.draggable = false;
                widget.removeEventListener('dragstart', handleDragStart);
                widget.removeEventListener('dragover', handleDragOver);
                widget.removeEventListener('drop', handleDrop);
                widget.removeEventListener('dragend', handleDragEnd);
            });
        }
    }

    function handleDragStart(e) {
        draggedWidget = e.target;
        e.target.style.opacity = '0.5';
    }

    function handleDragOver(e) {
        e.preventDefault();
    }

    function handleDrop(e) {
        e.preventDefault();
        if (draggedWidget !== e.target) {
            const draggedIndex = Array.from(draggedWidget.parentNode.children).indexOf(draggedWidget);
            const targetIndex = Array.from(e.target.parentNode.children).indexOf(e.target);
            
            if (draggedIndex < targetIndex) {
                e.target.parentNode.insertBefore(draggedWidget, e.target.nextSibling);
            } else {
                e.target.parentNode.insertBefore(draggedWidget, e.target);
            }
        }
    }

    function handleDragEnd(e) {
        e.target.style.opacity = '';
        draggedWidget = null;
    }

    function loadDefaultDashboard() {
        widgets = [...defaultWidgets];
        renderDashboard();
        loadMetrics();
    }

    function resetDashboard() {
        widgets = [...defaultWidgets];
        renderDashboard();
        loadMetrics();
    }

    function resetDashboardSettings() {
        if (confirm('Are you sure you want to reset the dashboard to default settings? This will remove all custom widgets.')) {
            resetDashboard();
        }
    }

    function renderDashboard() {
        const dashboardGrid = document.getElementById('dashboard-grid');
        dashboardGrid.innerHTML = '';

        widgets.forEach(widget => {
            const widgetElement = createWidgetElement(widget);
            dashboardGrid.appendChild(widgetElement);
        });

        initializeWidgetCharts();
    }

    function createWidgetElement(widget) {
        const widgetEl = document.createElement('div');
        widgetEl.className = `widget widget-${widget.size}`;
        widgetEl.id = widget.id;
        
        widgetEl.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${widget.title}</div>
                <div class="widget-controls">
                    <button class="widget-control" onclick="configureWidget('${widget.id}')">⚙</button>
                    <button class="widget-control delete" onclick="deleteWidget('${widget.id}')">×</button>
                </div>
            </div>
            <div class="widget-content" id="${widget.id}-content">
                ${getWidgetContent(widget)}
            </div>
        `;

        return widgetEl;
    }

    function getWidgetContent(widget) {
        switch (widget.chartType) {
            case 'number':
                return `
                    <div class="number-display">
                        <div class="number-value" id="${widget.id}-value">-</div>
                        <div class="number-label">${widget.title}</div>
                    </div>
                `;
            case 'gauge':
                return `
                    <div class="gauge-container">
                        <div class="gauge" id="${widget.id}-gauge">
                            <div class="gauge-value" id="${widget.id}-gauge-value">0%</div>
                        </div>
                    </div>
                `;
            default:
                return `<div class="chart-container"><canvas id="${widget.id}-chart"></canvas></div>`;
        }
    }

    function initializeWidgetCharts() {
        widgets.forEach(widget => {
            if (widget.chartType !== 'number' && widget.chartType !== 'gauge') {
                initChart(widget);
            }
        });
    }

    function initChart(widget) {
        const canvas = document.getElementById(`${widget.id}-chart`);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        const chartConfig = {
            type: widget.chartType === 'area' ? 'line' : widget.chartType,
            data: {
                labels: [],
                datasets: getDatasetConfig(widget)
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: settings.chartAnimation === 'enabled' ? 750 : 0
                },
                plugins: {
                    legend: {
                        display: widget.size !== 'small',
                        labels: { 
                            color: '#e0e0e0',
                            font: { size: 11 }
                        }
                    }
                },
                scales: getScalesConfig(widget)
            }
        };

        if (widget.chartType === 'area') {
            chartConfig.data.datasets[0].fill = true;
        }

        charts[widget.id] = new Chart(ctx, chartConfig);
    }

    function getDatasetConfig(widget) {
        const colors = {
            'cpu-overall': { border: '#007acc', background: 'rgba(0, 122, 204, 0.1)' },
            'cpu-cores': { border: '#007acc', background: 'rgba(0, 122, 204, 0.1)' },
            'cpu-load': { border: '#0066aa', background: 'rgba(0, 102, 170, 0.1)' },
            'memory-usage': { border: '#4caf50', background: 'rgba(76, 175, 80, 0.1)' },
            'memory-absolute': { border: '#4caf50', background: 'rgba(76, 175, 80, 0.1)' },
            'memory-breakdown': { border: '#4caf50', background: 'rgba(76, 175, 80, 0.1)' },
            'network-speed': [
                { label: 'Download', border: '#f44336', background: 'rgba(244, 67, 54, 0.1)' },
                { label: 'Upload', border: '#ff9800', background: 'rgba(255, 152, 0, 0.1)' }
            ],
            'network-bytes': [
                { label: 'RX Bytes', border: '#f44336', background: 'rgba(244, 67, 54, 0.1)' },
                { label: 'TX Bytes', border: '#ff9800', background: 'rgba(255, 152, 0, 0.1)' }
            ],
            'network-packets': [
                { label: 'RX Packets', border: '#f44336', background: 'rgba(244, 67, 54, 0.1)' },
                { label: 'TX Packets', border: '#ff9800', background: 'rgba(255, 152, 0, 0.1)' }
            ],
            'temperature-cpu': { border: '#ff5722', background: 'rgba(255, 87, 34, 0.1)' },
            'temperature-system': { border: '#2196f3', background: 'rgba(33, 150, 243, 0.1)' },
            'temperature-all': { border: '#ff5722', background: 'rgba(255, 87, 34, 0.1)' },
            'storage-usage': { border: '#9c27b0', background: 'rgba(156, 39, 176, 0.1)' },
            'storage-io': [
                { label: 'Read', border: '#9c27b0', background: 'rgba(156, 39, 176, 0.1)' },
                { label: 'Write', border: '#e91e63', background: 'rgba(233, 30, 99, 0.1)' }
            ]
        };

        const widgetColors = colors[widget.type] || colors['cpu-overall'];
        
        if (Array.isArray(widgetColors)) {
            return widgetColors.map(config => ({
                ...config,
                data: [],
                borderColor: config.border,
                backgroundColor: config.background,
                tension: 0.4,
                borderWidth: 1.5
            }));
        }

        return [{
            label: widget.title,
            data: [],
            borderColor: widgetColors.border,
            backgroundColor: widgetColors.background,
            tension: 0.4,
            borderWidth: 1.5
        }];
    }

    function getScalesConfig(widget) {
        const baseConfig = {
            y: {
                beginAtZero: true,
                ticks: { 
                    color: '#aaa',
                    font: { size: 10 }
                },
                grid: { 
                    color: settings.gridLines === 'enabled' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    lineWidth: 0.5
                }
            },
            x: {
                ticks: { 
                    color: '#aaa',
                    font: { size: 9 },
                    maxTicksLimit: widget.size === 'small' ? 4 : 8,
                    callback: function(value, index, values) {
                        const label = this.getLabelForValue(value);
                        if (settings.timestampDisplay === 'time') {
                            return label.split(' ')[1] || label;
                        } else if (settings.timestampDisplay === 'relative') {
                            const totalPoints = values.length;
                            const minutesAgo = (totalPoints - index - 1) * (settings.metricsInterval / 60);
                            return minutesAgo === 0 ? 'now' : `-${Math.round(minutesAgo)}m`;
                        }
                        return label;
                    }
                },
                grid: { 
                    color: settings.gridLines === 'enabled' ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                    lineWidth: 0.5
                }
            }
        };

        if (widget.type.includes('cpu') || widget.type.includes('memory-usage')) {
            baseConfig.y.max = 100;
        }

        if (widget.type.includes('network-speed')) {
            baseConfig.y.ticks.callback = function(value) {
                return formatSpeed(value, 0);
            };
        }

        if (widget.type.includes('temperature')) {
            baseConfig.y.ticks.callback = function(value) {
                const unit = settings.tempUnits === 'fahrenheit' ? '°F' : '°C';
                return value + unit;
            };
        }

        if (widget.type.includes('network')) {
            baseConfig.y.suggestedMin = -Math.max(...baseConfig.y.ticks.stepSize || [0]) * 0.1;
        }

        return baseConfig;
    }

    function addWidget(type, chartType, size, title) {
        const widget = {
            id: `widget-${++widgetIdCounter}`,
            type,
            chartType,
            size,
            title: title || getDefaultTitle(type)
        };

        widgets.push(widget);
        
        const widgetElement = createWidgetElement(widget);
        document.getElementById('dashboard-grid').appendChild(widgetElement);
        
        if (chartType !== 'number' && chartType !== 'gauge') {
            initChart(widget);
        }
        
        loadMetrics();
    }

    function deleteWidget(widgetId) {
        widgets = widgets.filter(w => w.id !== widgetId);
        const widgetElement = document.getElementById(widgetId);
        if (widgetElement) {
            widgetElement.remove();
        }
        if (charts[widgetId]) {
            charts[widgetId].destroy();
            delete charts[widgetId];
        }
    }

    function configureWidget(widgetId) {
        const widget = widgets.find(w => w.id === widgetId);
        if (widget) {
            const newTitle = prompt('Enter new widget title:', widget.title);
            if (newTitle && newTitle.trim()) {
                widget.title = newTitle.trim();
                const titleElement = document.querySelector(`#${widgetId} .widget-title`);
                if (titleElement) {
                    titleElement.textContent = widget.title;
                }
            }
        }
    }

    function getDefaultTitle(type) {
        const titles = {
            'cpu-overall': 'CPU Usage',
            'cpu-cores': 'CPU Cores',
            'cpu-load': 'CPU Load',
            'memory-usage': 'Memory %',
            'memory-absolute': 'Memory Usage',
            'memory-breakdown': 'Memory Breakdown',
            'network-speed': 'Network Speed',
            'network-bytes': 'Network Bytes',
            'network-packets': 'Network Packets',
            'temperature-cpu': 'CPU Temperature',
            'temperature-system': 'System Temperature',
            'temperature-all': 'All Temperatures',
            'storage-usage': 'Storage Usage',
            'storage-io': 'Storage I/O',
            'uptime': 'System Uptime',
            'processes': 'Process Count',
            'users': 'Active Users'
        };
        return titles[type] || 'Widget';
    }

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

    widgetForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const type = document.getElementById('widget-type').value;
        const chartType = document.getElementById('chart-type').value;
        const size = document.getElementById('widget-size').value;
        const title = document.getElementById('widget-title').value;
        
        addWidget(type, chartType, size, title);
        closeWidgetModal();
        
        document.getElementById('widget-type').value = '';
        document.getElementById('chart-type').value = '';
        document.getElementById('widget-size').value = '';
        document.getElementById('widget-title').value = '';
    });

    authModal.addEventListener('click', (e) => {
        if (e.target === authModal) {
            closeAuthModal();
        }
    });

    widgetModal.addEventListener('click', (e) => {
        if (e.target === widgetModal) {
            closeWidgetModal();
        }
    });

    const settingsForms = [
        'dataCollectionForm',
        'displaySettingsForm', 
        'alertSettingsForm',
        'networkSettingsForm',
        'systemMonitoringForm',
        'loggingSettingsForm',
        'advancedSettingsForm'
    ];

    settingsForms.forEach(formId => {
        const form = document.getElementById(formId);
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                saveSettings(formId);
            });
        }
    });

    function saveSettings(formId) {
        const form = document.getElementById(formId);
        if (!form) return;
        
        const formData = new FormData(form);
        const updatedSettings = {};
        
        for (const [key, value] of formData.entries()) {
            updatedSettings[key] = isNaN(value) ? value : Number(value);
        }
        
        Object.keys(settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                const newValue = element.type === 'number' ? Number(element.value) : element.value;
                if (settings[key] !== newValue) {
                    settings[key] = newValue;
                    updatedSettings[key] = newValue;
                }
            }
        });
        
        applySettings();
        updateSettingsStatus('Settings saved successfully');
        showSettingsMessage('Settings saved successfully', 'success');
        
        fetch('/api/settings/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        }).catch(error => {
            console.error('Failed to save settings to server:', error);
        });
    }

    function loadSettingsFromStorage() {
        const savedSettings = localStorage.getItem('alcitySettings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                Object.assign(settings, parsed);
                populateSettingsForm();
                applySettings();
            } catch (error) {
                console.error('Failed to load settings from storage:', error);
            }
        }
    }

    function saveSettingsToStorage() {
        try {
            localStorage.setItem('alcitySettings', JSON.stringify(settings));
        } catch (error) {
            console.error('Failed to save settings to storage:', error);
        }
    }

    function populateSettingsForm() {
        Object.keys(settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'number') {
                    element.value = settings[key];
                } else if (element.tagName === 'SELECT') {
                    element.value = settings[key];
                } else {
                    element.value = settings[key];
                }
            }
        });
    }

    function updateSettingsStatus(message) {
        const statusElement = document.getElementById('settingsStatus');
        const lastChangeElement = document.getElementById('lastSettingsChange');
        
        if (statusElement) {
            statusElement.textContent = message;
        }
        
        if (lastChangeElement) {
            lastChangeElement.textContent = new Date().toLocaleString();
        }
    }

    function showSettingsMessage(message, type = 'info') {
        const messageEl = document.createElement('div');
        messageEl.className = `settings-message ${type}`;
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 4px;
            color: white;
            font-size: 14px;
            z-index: 1001;
            background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(messageEl);
        
        setTimeout(() => {
            messageEl.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => messageEl.remove(), 300);
        }, 3000);
    }

    function resetDataSettings() {
        if (confirm('Reset data collection settings to default values?')) {
            settings.metricsInterval = 30;
            settings.dataRetention = 24;
            settings.cpuSampling = 'average';
            settings.tempUnits = 'celsius';
            settings.historyPoints = 500;
            settings.dataPrecision = 2;
            populateSettingsForm();
            applySettings();
            showSettingsMessage('Data settings reset to defaults', 'success');
        }
    }

    function resetDisplaySettings() {
        if (confirm('Reset display settings to default values?')) {
            settings.chartRefresh = 10;
            settings.timeFormat = '24h';
            settings.chartAnimation = 'enabled';
            settings.gridLines = 'enabled';
            settings.timestampDisplay = 'time';
            settings.maxChartPoints = 50;
            settings.performanceMode = 'balanced';
            settings.autoScale = 'enabled';
            populateSettingsForm();
            applySettings();
            showSettingsMessage('Display settings reset to defaults', 'success');
        }
    }

    function resetAlertSettings() {
        if (confirm('Reset alert thresholds to default values?')) {
            settings.cpuWarning = 80;
            settings.cpuCritical = 95;
            settings.memoryWarning = 85;
            settings.memoryCritical = 95;
            settings.tempWarning = 70;
            settings.tempCritical = 85;
            settings.storageWarning = 80;
            settings.storageCritical = 95;
            settings.visualAlerts = 'enabled';
            settings.alertSound = 'disabled';
            populateSettingsForm();
            applySettings();
            showSettingsMessage('Alert settings reset to defaults', 'success');
        }
    }

    function resetNetworkSettings() {
        if (confirm('Reset network settings to default values?')) {
            settings.defaultInterface = 'auto';
            settings.networkUnits = 'bytes';
            settings.monitorAllInterfaces = 'disabled';
            settings.showInterfaceStats = 'enabled';
            settings.networkPolling = 2;
            settings.bandwidthDetection = 'enabled';
            populateSettingsForm();
            applySettings();
            showSettingsMessage('Network settings reset to defaults', 'success');
        }
    }

    function resetMonitoringSettings() {
        if (confirm('Reset monitoring settings to default values?')) {
            settings.cpuCoreMonitoring = 'enabled';
            settings.processMonitoring = 'enabled';
            settings.diskIoMonitoring = 'enabled';
            settings.smartMonitoring = 'enabled';
            settings.loadMonitoring = 'enabled';
            settings.serviceMonitoring = 'enabled';
            populateSettingsForm();
            applySettings();
            showSettingsMessage('Monitoring settings reset to defaults', 'success');
        }
    }

    function resetLoggingSettings() {
        if (confirm('Reset logging settings to default values?')) {
            settings.logLevel = 'info';
            settings.logRotationSize = 50;
            settings.maxLogFiles = 5;
            settings.enableSystemLogging = 'enabled';
            settings.logCompression = 'enabled';
            settings.remoteLogging = 'disabled';
            populateSettingsForm();
            applySettings();
            showSettingsMessage('Logging settings reset to defaults', 'success');
        }
    }

    function resetAdvancedSettings() {
        if (confirm('Reset advanced settings to default values?')) {
            settings.apiRateLimit = 'medium';
            settings.memoryLimit = 1024;
            settings.dbCleanup = 'daily';
            settings.debugMode = 'disabled';
            settings.autoUpdate = 'disabled';
            settings.experimentalFeatures = 'disabled';
            populateSettingsForm();
            applySettings();
            showSettingsMessage('Advanced settings reset to defaults', 'success');
        }
    }

    function resetAllSettings() {
        if (confirm('This will reset ALL settings to their default values. Are you sure?')) {
            settings = {
                metricsInterval: 30,
                dataRetention: 24,
                cpuSampling: 'average',
                tempUnits: 'celsius',
                chartRefresh: 10,
                timeFormat: '24h',
                chartAnimation: 'enabled',
                gridLines: 'enabled',
                timestampDisplay: 'time',
                maxChartPoints: 50,
                cpuWarning: 80,
                cpuCritical: 95,
                memoryWarning: 85,
                memoryCritical: 95,
                tempWarning: 70,
                tempCritical: 85,
                storageWarning: 80,
                storageCritical: 95,
                defaultInterface: 'auto',
                networkUnits: 'bytes',
                monitorAllInterfaces: 'disabled',
                showInterfaceStats: 'enabled',
                logLevel: 'info',
                logRotationSize: 50,
                maxLogFiles: 5,
                enableSystemLogging: 'enabled'
            };
            populateSettingsForm();
            applySettings();
            saveSettingsToStorage();
            showSettingsMessage('All settings reset to defaults', 'success');
        }
    }

    function factoryReset() {
        if (confirm('This will perform a complete factory reset, clearing all data and settings. This cannot be undone. Are you sure?')) {
            if (confirm('Last chance - this will delete everything. Continue?')) {
                localStorage.clear();
                resetAllSettings();
                resetDashboard();
                clearMetricsData();
                clearCache();
                showSettingsMessage('Factory reset completed', 'success');
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            }
        }
    }

    function exportSettings() {
        const settingsData = {
            settings: settings,
            widgets: widgets,
            timestamp: new Date().toISOString(),
            version: '3.4.0'
        };
        
        const dataStr = JSON.stringify(settingsData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `alcity-settings-${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        showSettingsMessage('Settings exported successfully', 'success');
    }

    function importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = function(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        const importedData = JSON.parse(e.target.result);
                        
                        if (importedData.settings) {
                            Object.assign(settings, importedData.settings);
                            populateSettingsForm();
                            applySettings();
                            saveSettingsToStorage();
                        }
                        
                        if (importedData.widgets) {
                            widgets = importedData.widgets;
                            renderDashboard();
                        }
                        
                        showSettingsMessage('Settings imported successfully', 'success');
                    } catch (error) {
                        showSettingsMessage('Failed to import settings: Invalid file format', 'error');
                    }
                };
                reader.readAsText(file);
            }
        };
        
        input.click();
    }

    function clearBrowserCache() {
        if (confirm('Clear browser cache and temporary files?')) {
            if ('caches' in window) {
                caches.keys().then(function(names) {
                    names.forEach(function(name) {
                        caches.delete(name);
                    });
                });
            }
            
            sessionStorage.clear();
            showSettingsMessage('Browser cache cleared', 'success');
        }
    }

    function restartServices() {
        if (confirm('Restart monitoring services? This may cause a brief interruption.')) {
            fetch('/api/services/restart', { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        showSettingsMessage('Services restarted successfully', 'success');
                    } else {
                        showSettingsMessage('Failed to restart services', 'error');
                    }
                })
                .catch(error => {
                    showSettingsMessage('Error restarting services: ' + error.message, 'error');
                });
        }
    }

    function applySettings() {
        refreshInterval = settings.chartRefresh * 1000;
        startAutoRefresh();
        
        Object.keys(charts).forEach(chartId => {
            const chart = charts[chartId];
            if (chart && chart.options) {
                if (chart.options.animation) {
                    chart.options.animation.duration = settings.chartAnimation === 'enabled' ? 750 : 0;
                }
                
                if (chart.options.scales && chart.options.scales.x && chart.options.scales.x.grid) {
                    chart.options.scales.x.grid.color = settings.gridLines === 'enabled' ? 'rgba(255, 255, 255, 0.05)' : 'transparent';
                }
                
                if (chart.options.scales && chart.options.scales.y && chart.options.scales.y.grid) {
                    chart.options.scales.y.grid.color = settings.gridLines === 'enabled' ? 'rgba(255, 255, 255, 0.1)' : 'transparent';
                }
                
                if (chart.options.scales && chart.options.scales.x && chart.options.scales.x.ticks) {
                    chart.options.scales.x.ticks.maxTicksLimit = settings.maxChartPoints > 100 ? 12 : 8;
                }
                
                chart.update('none');
            }
        });
        
        const performanceMode = settings.performanceMode || 'balanced';
        if (performanceMode === 'performance') {
            refreshInterval = Math.max(refreshInterval, 15000);
            settings.chartAnimation = 'disabled';
            settings.maxChartPoints = Math.min(settings.maxChartPoints, 50);
        } else if (performanceMode === 'high') {
            settings.chartAnimation = 'enabled';
        }
        
        saveSettingsToStorage();
    }

    function clearMetricsData() {
        if (confirm('Are you sure you want to clear all metrics data? This cannot be undone.')) {
            fetch('/api/metrics/clear', { method: 'POST' })
                .then(() => {
                    alert('Metrics data cleared successfully');
                    loadMetrics();
                })
                .catch(error => {
                    alert('Failed to clear metrics data: ' + error.message);
                });
        }
    }

    function clearCache() {
        if (confirm('Are you sure you want to clear the application cache?')) {
            fetch('/api/cache/clear', { method: 'POST' })
                .then(() => {
                    alert('Cache cleared successfully');
                })
                .catch(error => {
                    alert('Failed to clear cache: ' + error.message);
                });
        }
    }

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
            const defaultInterfaceSelect = document.getElementById('defaultInterface');
            
            if (data.interfaces && data.interfaces.length > 0) {
                [interfaceSelect, defaultInterfaceSelect].forEach(select => {
                    if (select) {
                        const existingOptions = select.innerHTML;
                        select.innerHTML = '';
                        
                        if (select === defaultInterfaceSelect) {
                            const autoOption = document.createElement('option');
                            autoOption.value = 'auto';
                            autoOption.textContent = 'Auto-detect';
                            select.appendChild(autoOption);
                        }
                        
                        data.interfaces.forEach(iface => {
                            const option = document.createElement('option');
                            option.value = iface.interface;
                            option.textContent = iface.interface;
                            select.appendChild(option);
                        });
                    }
                });
                
                if (!currentInterface && interfaceSelect && interfaceSelect.options.length > 0) {
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
        const k = settings.networkUnits === 'bits' ? 1000 : 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = settings.networkUnits === 'bits' ? 
            ['b/s', 'Kb/s', 'Mb/s', 'Gb/s'] : 
            ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        
        const value = settings.networkUnits === 'bits' ? bytesPerSecond * 8 : bytesPerSecond;
        const i = Math.floor(Math.log(value) / Math.log(k));
        return parseFloat((value / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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

    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const timeFormat = settings.timeFormat === '12h' ? 'en-US' : 'en-GB';
        const options = settings.timeFormat === '12h' ? 
            { hour: 'numeric', minute: '2-digit', hour12: true } : 
            { hour: '2-digit', minute: '2-digit', hour12: false };
        
        return date.toLocaleTimeString(timeFormat, options);
    }

    function convertTemperature(celsius) {
        return settings.tempUnits === 'fahrenheit' ? (celsius * 9/5) + 32 : celsius;
    }

    function updateWidgets(data) {
        if (!data) return;

        widgets.forEach(widget => {
            updateWidget(widget, data);
        });
    }

    function updateWidget(widget, data) {
        switch (widget.type) {
            case 'cpu-overall':
                updateCpuOverallWidget(widget, data.cpu);
                break;
            case 'cpu-cores':
                updateCpuCoresWidget(widget, data.cpuCores);
                break;
            case 'cpu-load':
                updateCpuLoadWidget(widget, data.cpuLoad);
                break;
            case 'memory-usage':
                updateMemoryUsageWidget(widget, data.memory);
                break;
            case 'memory-absolute':
                updateMemoryAbsoluteWidget(widget, data.memory, data.memoryInfo);
                break;
            case 'memory-breakdown':
                updateMemoryBreakdownWidget(widget, data.memoryBreakdown);
                break;
            case 'network-speed':
                updateNetworkSpeedWidget(widget, data.network);
                break;
            case 'network-bytes':
                updateNetworkBytesWidget(widget, data.network);
                break;
            case 'network-packets':
                updateNetworkPacketsWidget(widget, data.network);
                break;
            case 'temperature-cpu':
                updateTemperatureCpuWidget(widget, temperatureData.cpu);
                break;
            case 'temperature-system':
                updateTemperatureSystemWidget(widget, temperatureData.system);
                break;
            case 'temperature-all':
                updateTemperatureAllWidget(widget, temperatureData);
                break;
            case 'storage-usage':
                updateStorageUsageWidget(widget, data.storage);
                break;
            case 'storage-io':
                updateStorageIoWidget(widget, data.storageIo);
                break;
            case 'uptime':
                updateUptimeWidget(widget, data.uptime);
                break;
            case 'processes':
                updateProcessesWidget(widget, data.processes);
                break;
            case 'users':
                updateUsersWidget(widget, data.users);
                break;
        }
    }

    function updateCpuOverallWidget(widget, cpuData) {
        if (!cpuData || !cpuData.length) return;

        const latest = cpuData[cpuData.length - 1].value;

        if (widget.chartType === 'number') {
            const valueElement = document.getElementById(`${widget.id}-value`);
            if (valueElement) {
                valueElement.textContent = `${latest.toFixed(1)}%`;
                valueElement.style.color = latest > settings.cpuCritical ? '#f44336' : 
                                          latest > settings.cpuWarning ? '#ff9800' : '#ffffff';
            }
        } else if (widget.chartType === 'gauge') {
            updateGauge(widget.id, latest);
        } else if (charts[widget.id]) {
            const limitedData = cpuData.slice(-settings.maxChartPoints);
            const labels = limitedData.map(point => formatTimestamp(point.timestamp));
            const values = limitedData.map(point => point.value);
            
            charts[widget.id].data.labels = labels;
            charts[widget.id].data.datasets[0].data = values;
            charts[widget.id].update('none');
        }
    }

    function updateCpuCoresWidget(widget, cpuCoresData) {
        if (!cpuCoresData || !cpuCoresData.length) return;

        if (charts[widget.id]) {
            const labels = cpuCoresData.map((_, index) => `Core ${index}`);
            const values = cpuCoresData.map(core => core.value || 0);
            
            charts[widget.id].data.labels = labels;
            charts[widget.id].data.datasets[0].data = values;
            charts[widget.id].update('none');
        }
    }

    function updateMemoryUsageWidget(widget, memoryData) {
        if (!memoryData || !memoryData.length) return;

        const latest = memoryData[memoryData.length - 1].value;

        if (widget.chartType === 'number') {
            const valueElement = document.getElementById(`${widget.id}-value`);
            if (valueElement) {
                valueElement.textContent = `${latest.toFixed(1)}%`;
                valueElement.style.color = latest > settings.memoryCritical ? '#f44336' : 
                                          latest > settings.memoryWarning ? '#ff9800' : '#ffffff';
            }
        } else if (widget.chartType === 'gauge') {
            updateGauge(widget.id, latest);
        } else if (charts[widget.id]) {
            const limitedData = memoryData.slice(-settings.maxChartPoints);
            const labels = limitedData.map(point => formatTimestamp(point.timestamp));
            const values = limitedData.map(point => point.value);
            
            charts[widget.id].data.labels = labels;
            charts[widget.id].data.datasets[0].data = values;
            charts[widget.id].update('none');
        }
    }

    function updateNetworkSpeedWidget(widget, networkData) {
        if (!networkData || !currentInterface || !networkData[currentInterface]) return;

        const interfaceData = networkData[currentInterface];
        const rxData = interfaceData.rx_bytes;
        const txData = interfaceData.tx_bytes;

        if (!rxData || !rxData.length || !txData || !txData.length) return;

        if (charts[widget.id]) {
            const limitedRxData = rxData.slice(-settings.maxChartPoints);
            const limitedTxData = txData.slice(-settings.maxChartPoints);
            
            const labels = limitedRxData.map(point => formatTimestamp(point.timestamp));
            const rxRates = [];
            const txRates = [];

            for (let i = 1; i < limitedRxData.length; i++) {
                const timeDiff = (limitedRxData[i].timestamp - limitedRxData[i-1].timestamp) / 1000;
                if (timeDiff > 0) {
                    const rxDiff = limitedRxData[i].value - limitedRxData[i-1].value;
                    const txDiff = limitedTxData[i].value - limitedTxData[i-1].value;
                    rxRates.push(Math.max(0, rxDiff / timeDiff));
                    txRates.push(Math.max(0, txDiff / timeDiff));
                } else {
                    rxRates.push(0);
                    txRates.push(0);
                }
            }

            rxRates.unshift(0);
            txRates.unshift(0);

            charts[widget.id].data.labels = labels;
            charts[widget.id].data.datasets[0].data = rxRates;
            charts[widget.id].data.datasets[1].data = txRates;
            
            const maxValue = Math.max(...rxRates, ...txRates);
            charts[widget.id].options.scales.y.suggestedMax = maxValue * 1.1;
            charts[widget.id].options.scales.y.suggestedMin = -maxValue * 0.05;
            
            charts[widget.id].update('none');
        }
    }

    function updateTemperatureCpuWidget(widget, tempData) {
        if (!tempData || !tempData.length) return;

        if (widget.chartType === 'number') {
            const maxTemp = Math.max(...tempData.map(item => item.value));
            const valueElement = document.getElementById(`${widget.id}-value`);
            if (valueElement) {
                const convertedTemp = convertTemperature(maxTemp);
                const unit = settings.tempUnits === 'fahrenheit' ? '°F' : '°C';
                valueElement.textContent = `${convertedTemp.toFixed(1)}${unit}`;
                valueElement.style.color = maxTemp > settings.tempCritical ? '#f44336' : 
                                          maxTemp > settings.tempWarning ? '#ff9800' : '#ffffff';
            }
        } else if (charts[widget.id]) {
            const labels = tempData.map(item => item.name);
            const values = tempData.map(item => convertTemperature(item.value));
            
            charts[widget.id].data.labels = labels;
            charts[widget.id].data.datasets[0].data = values;
            charts[widget.id].update('none');
        }
    }

    function updateUptimeWidget(widget, uptime) {
        if (widget.chartType === 'number') {
            const valueElement = document.getElementById(`${widget.id}-value`);
            if (valueElement && uptime) {
                valueElement.textContent = formatUptime(uptime);
            }
        }
    }

    function updateGauge(widgetId, value) {
        const gauge = document.getElementById(`${widgetId}-gauge`);
        const gaugeValue = document.getElementById(`${widgetId}-gauge-value`);
        
        if (gauge && gaugeValue) {
            const percentage = Math.min(Math.max(value, 0), 100);
            const rotation = (percentage / 100) * 360;
            
            const color = percentage > 90 ? '#f44336' : percentage > 70 ? '#ff9800' : '#0066cc';
            gauge.style.background = `conic-gradient(from 0deg, ${color} ${rotation}deg, #333 ${rotation}deg)`;
            gaugeValue.textContent = `${percentage.toFixed(1)}%`;
        }
    }

    async function loadMetrics() {
        const data = await fetchMetricsHistory();
        if (data) {
            updateWidgets(data);
            updateStandardCharts(data);
        }
        
        const tempData = await fetchTemperatureData();
        if (tempData) {
            updateTemperatureCategories();
        }
        
        if (currentPanel === 'storage') {
            await updateDiskInfo();
        }
    }

    function updateStandardCharts(data) {
        if (data.cpu && data.cpu.length > 0) {
            const cpuChart = charts['cpu-chart'];
            if (cpuChart) {
                const limitedData = data.cpu.slice(-settings.maxChartPoints);
                const labels = limitedData.map(point => formatTimestamp(point.timestamp));
                const values = limitedData.map(point => point.value);
                
                cpuChart.data.labels = labels;
                cpuChart.data.datasets[0].data = values;
                cpuChart.update('none');

                const currentCpu = values[values.length - 1];
                const avgCpu = values.reduce((sum, val) => sum + val, 0) / values.length;
                
                const cpuCurrentElement = document.getElementById('cpu-current');
                const cpuAvgElement = document.getElementById('cpu-avg');
                
                if (cpuCurrentElement) cpuCurrentElement.textContent = `Current: ${currentCpu.toFixed(2)}%`;
                if (cpuAvgElement) cpuAvgElement.textContent = `Average: ${avgCpu.toFixed(2)}%`;
            }
        }

        if (data.memory && data.memory.length > 0) {
            const memoryChart = charts['memory-chart'];
            if (memoryChart) {
                const limitedData = data.memory.slice(-settings.maxChartPoints);
                const labels = limitedData.map(point => formatTimestamp(point.timestamp));
                const values = limitedData.map(point => point.value);
                
                memoryChart.data.labels = labels;
                memoryChart.data.datasets[0].data = values;
                memoryChart.update('none');

                const currentMemory = values[values.length - 1];
                const memoryCurrentElement = document.getElementById('memory-current');
                if (memoryCurrentElement) {
                    memoryCurrentElement.textContent = `Current: ${currentMemory.toFixed(2)}%`;
                }
            }
        }

        if (currentInterface && data.network && data.network[currentInterface]) {
            const networkChart = charts['network-chart'];
            if (networkChart) {
                const networkData = data.network[currentInterface];
                const rxData = networkData.rx_bytes;
                const txData = networkData.tx_bytes;

                if (rxData && rxData.length > 0 && txData && txData.length > 0) {
                    const limitedRxData = rxData.slice(-settings.maxChartPoints);
                    const limitedTxData = txData.slice(-settings.maxChartPoints);
                    
                    const labels = limitedRxData.map(point => formatTimestamp(point.timestamp));
                    const rxRates = [];
                    const txRates = [];

                    for (let i = 1; i < limitedRxData.length; i++) {
                        const timeDiff = (limitedRxData[i].timestamp - limitedRxData[i-1].timestamp) / 1000;
                        if (timeDiff > 0) {
                            const rxDiff = limitedRxData[i].value - limitedRxData[i-1].value;
                            const txDiff = limitedTxData[i].value - limitedTxData[i-1].value;
                            rxRates.push(Math.max(0, rxDiff / timeDiff));
                            txRates.push(Math.max(0, txDiff / timeDiff));
                        } else {
                            rxRates.push(0);
                            txRates.push(0);
                        }
                    }

                    rxRates.unshift(0);
                    txRates.unshift(0);

                    networkChart.data.labels = labels;
                    networkChart.data.datasets[0].data = rxRates;
                    networkChart.data.datasets[1].data = txRates;
                    
                    const maxValue = Math.max(...rxRates, ...txRates);
                    networkChart.options.scales.y.suggestedMax = maxValue * 1.1;
                    networkChart.options.scales.y.suggestedMin = -maxValue * 0.05;
                    
                    networkChart.update('none');

                    const lastRxRate = rxRates[rxRates.length - 1] || 0;
                    const lastTxRate = txRates[txRates.length - 1] || 0;
                    
                    const networkRxElement = document.getElementById('network-rx');
                    const networkTxElement = document.getElementById('network-tx');
                    
                    if (networkRxElement) networkRxElement.textContent = `Download: ${formatSpeed(lastRxRate)}`;
                    if (networkTxElement) networkTxElement.textContent = `Upload: ${formatSpeed(lastTxRate)}`;
                }
            }
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
                    const temp = convertTemperature(item.value);
                    const unit = settings.tempUnits === 'fahrenheit' ? '°F' : '°C';
                    const rawTemp = item.value;
                    const tempClass = rawTemp > settings.tempCritical ? 'critical' : 
                                     (rawTemp > settings.tempWarning ? 'warning' : '');
                    html += `
                        <div class="temperature-item">
                            <div class="temperature-name">${item.name}</div>
                            <div class="temperature-value ${tempClass}">${temp.toFixed(1)}${unit}</div>
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
                const usagePercent = parseInt(partition.percentage, 10);
                const usageClass = usagePercent > settings.storageCritical ? 'critical' : 
                                  (usagePercent > settings.storageWarning ? 'warning' : '');
                diskHTML += `
                    <div class="disk-partition">
                        <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                            <span class="${usageClass}">${partition.percentage} used (${partition.used} / ${partition.size})</span>
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
                    const temp = convertTemperature(disk.smart.temperature);
                    const unit = settings.tempUnits === 'fahrenheit' ? '°F' : '°C';
                    diskHTML += `<div class="disk-detail-row"><div class="disk-detail-label">Temperature:</div><div>${temp.toFixed(1)}${unit}</div></div>`;
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

    function initStandardCharts() {
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: settings.chartAnimation === 'enabled' ? 750 : 0
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { 
                        color: '#aaa',
                        font: { size: 10 }
                    },
                    grid: { 
                        color: settings.gridLines === 'enabled' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                        lineWidth: 0.5
                    }
                },
                x: {
                    ticks: { 
                        color: '#aaa',
                        font: { size: 9 },
                        maxTicksLimit: 8,
                        callback: function(value, index, values) {
                            const label = this.getLabelForValue(value);
                            return settings.timestampDisplay === 'time' ? 
                                   (label.split(' ')[1] || label) : label;
                        }
                    },
                    grid: { 
                        color: settings.gridLines === 'enabled' ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                        lineWidth: 0.5
                    }
                }
            },
            plugins: {
                legend: { labels: { color: '#e0e0e0', font: { size: 11 } } }
            }
        };

        const cpuChartElement = document.getElementById('cpu-chart');
        if (cpuChartElement) {
            charts['cpu-chart'] = new Chart(cpuChartElement, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'CPU Usage (%)',
                        data: [],
                        borderColor: '#007acc',
                        backgroundColor: 'rgba(0, 122, 204, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 1.5
                    }]
                },
                options: { ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, max: 100 } } }
            });
        }

        const memoryChartElement = document.getElementById('memory-chart');
        if (memoryChartElement) {
            charts['memory-chart'] = new Chart(memoryChartElement, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Memory Usage (%)',
                        data: [],
                        borderColor: '#4caf50',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 1.5
                    }]
                },
                options: { ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, max: 100 } } }
            });
        }

        const networkChartElement = document.getElementById('network-chart');
        if (networkChartElement) {
            const networkOptions = { ...chartOptions };
            networkOptions.scales.y.ticks.callback = function(value) {
                return formatSpeed(value, 0);
            };
            
            charts['network-chart'] = new Chart(networkChartElement, {
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
                            tension: 0.4,
                            borderWidth: 1.5
                        },
                        {
                            label: 'Upload (TX)',
                            data: [],
                            borderColor: '#ff9800',
                            backgroundColor: 'rgba(255, 152, 0, 0.1)',
                            fill: true,
                            tension: 0.4,
                            borderWidth: 1.5
                        }
                    ]
                },
                options: networkOptions
            });
        }

        const temperatureChartElement = document.getElementById('temperature-chart');
        if (temperatureChartElement) {
            const tempOptions = { ...chartOptions };
            tempOptions.scales.y.ticks.callback = function(value) {
                const unit = settings.tempUnits === 'fahrenheit' ? '°F' : '°C';
                return value + unit;
            };
            
            charts['temperature-chart'] = new Chart(temperatureChartElement, {
                type: 'bar',
                data: { labels: [], datasets: [] },
                options: tempOptions
            });
        }
    }

    function startAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
        }
        
        refreshTimer = setInterval(() => {
            if (['dashboard', 'cpu', 'memory', 'network', 'storage', 'temperature'].includes(currentPanel)) {
                loadMetrics();
            }
        }, refreshInterval);
    }

    function initSettingsTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                const targetContent = document.querySelector(`.tab-content[data-tab="${targetTab}"]`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
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
            loadMetrics();
        });
    }

    window.toggleSection = toggleSection;
    window.showPanel = showPanel;
    window.refreshLogs = refreshLogs;
    window.closeAuthModal = closeAuthModal;
    window.showWidgetSelector = showWidgetSelector;
    window.closeWidgetModal = closeWidgetModal;
    window.toggleEditMode = toggleEditMode;
    window.resetDashboard = resetDashboard;
    window.resetDashboardSettings = resetDashboardSettings;
    window.deleteWidget = deleteWidget;
    window.configureWidget = configureWidget;
    window.clearMetricsData = clearMetricsData;
    window.clearCache = clearCache;
    window.resetDataSettings = resetDataSettings;
    window.resetDisplaySettings = resetDisplaySettings;
    window.resetAlertSettings = resetAlertSettings;
    window.resetNetworkSettings = resetNetworkSettings;
    window.resetMonitoringSettings = resetMonitoringSettings;
    window.resetLoggingSettings = resetLoggingSettings;
    window.resetAdvancedSettings = resetAdvancedSettings;
    window.resetAllSettings = resetAllSettings;
    window.factoryReset = factoryReset;
    window.exportSettings = exportSettings;
    window.importSettings = importSettings;
    window.clearBrowserCache = clearBrowserCache;
    window.restartServices = restartServices;

    initStandardCharts();
    fetchNetworkInterfaces();
    loadSettingsFromStorage();
    loadDefaultDashboard();
    startAutoRefresh();
    updateSettingsStatus('System initialized successfully');
    

    initSettingsTabs();
});