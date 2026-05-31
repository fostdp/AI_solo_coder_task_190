class WeldPoolSimulation {
  constructor() {
    this.mainCanvas = document.getElementById('mainCanvas');
    this.mainCtx = this.mainCanvas.getContext('2d');
    this.grainCanvas = document.getElementById('grainCanvas');
    this.grainCtx = this.grainCanvas.getContext('2d');
    this.orientationCanvas = document.getElementById('orientationCanvas');
    this.orientationCtx = this.orientationCanvas.getContext('2d');
    this.animationCanvas = document.getElementById('animationCanvas');
    this.animationCtx = this.animationCanvas.getContext('2d');

    this.width = this.mainCanvas.width;
    this.height = this.mainCanvas.height;
    this.grainWidth = this.grainCanvas.width;
    this.grainHeight = this.grainCanvas.height;

    this.params = {
      weldingSpeed: 5.0,
      heatInput: 8.0,
      preheatTemp: 25,
      animSpeed: 1.0
    };

    this.displayOptions = {
      showPool: true,
      showHAZ: true,
      showGrains: true,
      showFront: true,
      showOrientation: true,
      showGrainBoundaries: false,
      viewMode: 'grainSize'
    };

    this.gridResolution = 200;
    this.cellSize = this.width / this.gridResolution;
    this.temperatureField = [];
    this.prevTemperatureField = [];

    this.materialProps = {
      Tm: 1538,
      Ts: 1490,
      Ac1: 727,
      thermalDiffusivity: 1.2e-5,
      meltingLatentHeat: 270000,
      density: 7850,
      specificHeat: 480
    };

    this.microstructure = new MicrostructureFramework(
      this.gridResolution,
      this.materialProps,
      this.cellSize
    );

    this.timeStep = 0;
    this.isRunning = false;
    this.isPaused = false;
    this.animationId = null;
    this.torchPosition = -50;
    this.currentParamsId = null;

    this.animationFrames = [];
    this.animationFrameIndex = 0;
    this.isAnimationPlaying = false;
    this.animationPlaybackSpeed = 1.0;
    this.animationIntervalId = null;

    this.currentAnalysis = null;

    this.grainColors = this.generateGrainColors(200);

    this.initTemperatureFields();
    this.bindEvents();
    this.render();
    this.updateStatus('就绪 - 调节参数后点击"开始模拟"');
  }

  generateGrainColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
      const hue = (i * 360 / count) % 360;
      const saturation = 60 + Math.random() * 20;
      const lightness = 45 + Math.random() * 15;
      colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    }
    return colors;
  }

  initTemperatureFields() {
    this.temperatureField = [];
    this.prevTemperatureField = [];

    for (let y = 0; y < this.gridResolution; y++) {
      this.temperatureField[y] = [];
      this.prevTemperatureField[y] = [];
      for (let x = 0; x < this.gridResolution; x++) {
        this.temperatureField[y][x] = this.params.preheatTemp;
        this.prevTemperatureField[y][x] = this.params.preheatTemp;
      }
    }
  }

  initAllFields() {
    this.initTemperatureFields();
    this.microstructure.init();
    this.timeStep = 0;
    this.torchPosition = -50;
    this.animationFrames = [];
    this.animationFrameIndex = 0;
  }

  bindEvents() {
    document.getElementById('weldingSpeed').addEventListener('input', (e) => {
      this.params.weldingSpeed = parseFloat(e.target.value);
      document.getElementById('speedValue').textContent = this.params.weldingSpeed.toFixed(1);
    });

    document.getElementById('heatInput').addEventListener('input', (e) => {
      this.params.heatInput = parseFloat(e.target.value);
      document.getElementById('heatValue').textContent = this.params.heatInput.toFixed(1);
    });

    document.getElementById('temperature').addEventListener('input', (e) => {
      this.params.preheatTemp = parseFloat(e.target.value);
      document.getElementById('tempValue').textContent = this.params.preheatTemp.toFixed(0);
      if (!this.isRunning) {
        this.initAllFields();
        this.render();
      }
    });

    document.getElementById('speedControl').addEventListener('input', (e) => {
      this.params.animSpeed = parseFloat(e.target.value);
      document.getElementById('animSpeedValue').textContent = this.params.animSpeed.toFixed(1);
    });

    document.getElementById('showPool').addEventListener('change', (e) => {
      this.displayOptions.showPool = e.target.checked;
      this.render();
    });
    document.getElementById('showHAZ').addEventListener('change', (e) => {
      this.displayOptions.showHAZ = e.target.checked;
      this.render();
    });
    document.getElementById('showGrains').addEventListener('change', (e) => {
      this.displayOptions.showGrains = e.target.checked;
      this.render();
    });
    document.getElementById('showFront').addEventListener('change', (e) => {
      this.displayOptions.showFront = e.target.checked;
      this.render();
    });
    document.getElementById('showOrientation').addEventListener('change', (e) => {
      this.displayOptions.showOrientation = e.target.checked;
      this.render();
    });
    document.getElementById('showGrainBoundaries').addEventListener('change', (e) => {
      this.displayOptions.showGrainBoundaries = e.target.checked;
      this.render();
    });

    document.getElementById('viewModeGrain').addEventListener('click', (e) => {
      this.displayOptions.viewMode = 'grainSize';
      this.setActiveViewButton(e.target);
      document.getElementById('grainCanvasTitle').textContent = '晶粒尺寸分布图';
      this.render();
    });
    document.getElementById('viewModeOrientation').addEventListener('click', (e) => {
      this.displayOptions.viewMode = 'orientation';
      this.setActiveViewButton(e.target);
      document.getElementById('grainCanvasTitle').textContent = '晶粒取向分布图';
      this.render();
    });
    document.getElementById('viewModeCooling').addEventListener('click', (e) => {
      this.displayOptions.viewMode = 'cooling';
      this.setActiveViewButton(e.target);
      document.getElementById('grainCanvasTitle').textContent = '冷却速率分布图';
      this.render();
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    document.getElementById('startBtn').addEventListener('click', () => this.start());
    document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
    document.getElementById('resetBtn').addEventListener('click', () => this.reset());
    document.getElementById('saveParamsBtn').addEventListener('click', () => this.saveParams());
    document.getElementById('saveSnapshotBtn').addEventListener('click', () => this.saveSnapshot());
    document.getElementById('analyzeBtn').addEventListener('click', () => this.analyzeProcess());
    document.getElementById('loadHistoryBtn').addEventListener('click', () => this.loadHistory());

    document.getElementById('playAnimation').addEventListener('click', () => this.playAnimation());
    document.getElementById('pauseAnimation').addEventListener('click', () => this.pauseAnimation());
    document.getElementById('resetAnimation').addEventListener('click', () => this.resetAnimation());
    document.getElementById('animPlaybackSpeed').addEventListener('input', (e) => {
      this.animationPlaybackSpeed = parseFloat(e.target.value);
      document.getElementById('animPlaybackSpeedValue').textContent = this.animationPlaybackSpeed.toFixed(1) + 'x';
    });
  }

  setActiveViewButton(target) {
    document.querySelectorAll('#viewModeGrain, #viewModeOrientation, #viewModeCooling').forEach(btn => {
      btn.classList.remove('btn-active');
    });
    target.classList.add('btn-active');
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    if (tabName === 'orientation') {
      this.renderOrientationCanvas();
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    document.getElementById('startBtn').disabled = true;
    document.getElementById('pauseBtn').disabled = false;
    document.getElementById('pauseBtn').textContent = '暂停';
    this.updateStatus('模拟运行中...', 'running');
    this.animate();
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    document.getElementById('pauseBtn').textContent = this.isPaused ? '继续' : '暂停';
    this.updateStatus(this.isPaused ? '模拟已暂停' : '模拟运行中...', this.isPaused ? 'paused' : 'running');
  }

  reset() {
    this.isRunning = false;
    this.isPaused = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('pauseBtn').textContent = '暂停';
    this.initAllFields();
    this.render();
    this.updateInfo();
    this.updateStatus('就绪 - 调节参数后点击"开始模拟"');
  }

  animate() {
    if (!this.isRunning) return;
    if (!this.isPaused) {
      for (let i = 0; i < this.params.animSpeed; i++) {
        this.simulateStep();
      }
      this.render();
      this.updateInfo();
      
      if (this.timeStep % 5 === 0) {
        this.captureAnimationFrame();
      }
    }
    this.animationId = requestAnimationFrame(() => this.animate());
  }

  simulateStep() {
    this.timeStep++;
    const torchSpeed = this.params.weldingSpeed * 0.5;
    this.torchPosition += torchSpeed;

    if (this.torchPosition > this.width + 100) {
      this.isRunning = false;
      document.getElementById('startBtn').disabled = false;
      document.getElementById('pauseBtn').disabled = true;
      this.updateStatus('模拟完成 - 焊枪已移出工件', 'paused');
      return;
    }

    this.prevTemperatureField = this.temperatureField.map(row => [...row]);
    this.updateTemperatureField();
    this.microstructure.update(this.temperatureField, this.prevTemperatureField);
  }

  captureAnimationFrame() {
    const microData = this.microstructure.exportMicrostructureData();
    this.animationFrames.push({
      timeStep: this.timeStep,
      torchPosition: this.torchPosition,
      temperatureField: this.temperatureField.map(row => [...row]),
      microData: microData
    });
    
    document.getElementById('animFrameInfo').textContent = 
      `帧数: ${this.animationFrames.length}`;
  }

  updateTemperatureField() {
    const alpha = this.materialProps.thermalDiffusivity;
    const dt = 0.01;
    const dx = this.cellSize / 1000;
    const torchX = this.torchPosition / this.width * this.gridResolution;
    const torchY = this.gridResolution * 0.5;

    const effectiveHeat = this.params.heatInput * 1000;
    const sigma = 15 + this.params.heatInput * 0.8;

    const phaseFieldData = this.microstructure.getPhaseField().getData();

    const newTemp = [];
    for (let y = 0; y < this.gridResolution; y++) {
      newTemp[y] = [];
      for (let x = 0; x < this.gridResolution; x++) {
        let laplacian = 0;
        if (x > 0) laplacian += this.temperatureField[y][x - 1];
        if (x < this.gridResolution - 1) laplacian += this.temperatureField[y][x + 1];
        if (y > 0) laplacian += this.temperatureField[y - 1][x];
        if (y < this.gridResolution - 1) laplacian += this.temperatureField[y + 1][x];
        laplacian -= 4 * this.temperatureField[y][x];
        laplacian /= (dx * dx);

        const dist = Math.sqrt(Math.pow(x - torchX, 2) + Math.pow(y - torchY, 2));
        const heatSource = effectiveHeat * Math.exp(-(dist * dist) / (2 * sigma * sigma)) / (2 * Math.PI * sigma * sigma);

        let newT = this.temperatureField[y][x] + dt * (alpha * laplacian + heatSource / (this.materialProps.density * this.materialProps.specificHeat));

        if (phaseFieldData[y] && phaseFieldData[y][x] > 0.1 && phaseFieldData[y][x] < 0.9) {
          const latentHeatEffect = this.materialProps.meltingLatentHeat / this.materialProps.specificHeat;
          if (phaseFieldData[y][x] > 0.5) {
            newT -= latentHeatEffect * dt * 0.5;
          }
        }

        newT = Math.max(this.params.preheatTemp, Math.min(3000, newT));
        newTemp[y][x] = newT;
      }
    }

    this.temperatureField = newTemp;
  }

  render() {
    this.renderMainCanvas();
    this.renderGrainCanvas();
  }

  renderMainCanvas() {
    const ctx = this.mainCtx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(0, 0, this.width, this.height);

    const imageData = ctx.createImageData(this.width, this.height);
    const data = imageData.data;

    const Tm = this.materialProps.Tm;
    const Ts = this.materialProps.Ts;
    const Ac1 = this.materialProps.Ac1;

    const phaseFieldData = this.microstructure.getPhaseField().getData();
    const grainIdField = this.microstructure.getCellularAutomaton().getGrainIdField();

    for (let y = 0; y < this.gridResolution; y++) {
      for (let x = 0; x < this.gridResolution; x++) {
        const T = this.temperatureField[y][x];
        const phase = phaseFieldData[y][x];
        const grainIdx = grainIdField[y][x];

        let r, g, b;

        if (T >= Tm && this.displayOptions.showPool) {
          const intensity = Math.min(1, (T - Tm) / 500);
          r = Math.floor(255);
          g = Math.floor(107 + intensity * 80);
          b = Math.floor(53 + intensity * 50);
        } else if (T >= Ac1 && T < Tm && this.displayOptions.showHAZ) {
          const ratio = (T - Ac1) / (Tm - Ac1);
          r = Math.floor(255);
          g = Math.floor(217 * ratio + 150 * (1 - ratio));
          b = Math.floor(61 * ratio);
          if (phase < 0.5 && grainIdx !== -1 && this.displayOptions.showGrains) {
            const grainColor = this.grainColors[grainIdx % this.grainColors.length];
            const match = grainColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (match) {
              const h = parseInt(match[1]);
              const s = parseInt(match[2]);
              const l = parseInt(match[3]);
              const rgb = this.hslToRgb(h, s, l);
              r = Math.floor(r * 0.6 + rgb.r * 0.4);
              g = Math.floor(g * 0.6 + rgb.g * 0.4);
              b = Math.floor(b * 0.6 + rgb.b * 0.4);
            }
          }
        } else if (T < Ts && grainIdx !== -1 && this.displayOptions.showGrains) {
          const grainColor = this.grainColors[grainIdx % this.grainColors.length];
          const match = grainColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
          if (match) {
            const h = parseInt(match[1]);
            const s = parseInt(match[2]);
            const l = parseInt(match[3]);
            const rgb = this.hslToRgb(h, s, l);
            r = rgb.r;
            g = rgb.g;
            b = rgb.b;
          }
        } else {
          r = 30;
          g = 58;
          b = 95;
        }

        if (this.displayOptions.showGrainBoundaries && grainIdx !== -1) {
          const neighbors = [
            [y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]
          ];
          for (const [ny, nx] of neighbors) {
            if (ny >= 0 && ny < this.gridResolution && nx >= 0 && nx < this.gridResolution) {
              if (grainIdField[ny][nx] !== grainIdx) {
                r = Math.floor(r * 0.7);
                g = Math.floor(g * 0.7);
                b = Math.floor(b * 0.7);
                break;
              }
            }
          }
        }

        const startX = Math.floor(x * this.cellSize);
        const startY = Math.floor(y * this.cellSize);
        const endX = Math.floor((x + 1) * this.cellSize);
        const endY = Math.floor((y + 1) * this.cellSize);

        for (let py = startY; py < endY && py < this.height; py++) {
          for (let px = startX; px < endX && px < this.width; px++) {
            const idx = (py * this.width + px) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    if (this.displayOptions.showFront) {
      this.renderSolidificationFront(ctx);
    }

    this.renderTorch(ctx);
    this.renderScale(ctx);
  }

  hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n =>
      l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return {
      r: Math.floor(255 * f(0)),
      g: Math.floor(255 * f(8)),
      b: Math.floor(255 * f(4))
    };
  }

  renderSolidificationFront(ctx) {
    const Ts = this.materialProps.Ts;
    const Tm = this.materialProps.Tm;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();

    let firstPoint = true;
    for (let x = 0; x < this.gridResolution; x += 2) {
      let frontY = -1;
      for (let y = 0; y < this.gridResolution; y++) {
        if (this.temperatureField[y][x] <= Tm && this.temperatureField[y][x] >= Ts) {
          frontY = y;
          break;
        }
      }
      if (frontY >= 0) {
        const canvasX = x * this.cellSize;
        const canvasY = frontY * this.cellSize;
        if (firstPoint) {
          ctx.moveTo(canvasX, canvasY);
          firstPoint = false;
        } else {
          ctx.lineTo(canvasX, canvasY);
        }
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  renderTorch(ctx) {
    const torchX = this.torchPosition;
    const torchY = this.height * 0.5;

    if (torchX > -30 && torchX < this.width + 30) {
      const gradient = ctx.createRadialGradient(torchX, torchY, 0, torchX, torchY, 80);
      gradient.addColorStop(0, 'rgba(255, 200, 50, 0.8)');
      gradient.addColorStop(0.5, 'rgba(255, 100, 50, 0.4)');
      gradient.addColorStop(1, 'rgba(255, 50, 50, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(torchX, torchY, 80, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(torchX, torchY, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(torchX, torchY, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderScale(ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, this.height - 20);
    ctx.lineTo(20 + 100, this.height - 20);
    ctx.moveTo(20, this.height - 25);
    ctx.lineTo(20, this.height - 15);
    ctx.moveTo(120, this.height - 25);
    ctx.lineTo(120, this.height - 15);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '11px sans-serif';
    ctx.fillText('10 mm', 55, this.height - 8);
  }

  renderGrainCanvas() {
    const ctx = this.grainCtx;
    ctx.clearRect(0, 0, this.grainWidth, this.grainHeight);

    const grainSizeMap = this.microstructure.getGrainSizeModel().getGrainSizeMapData();
    const grainIdField = this.microstructure.getCellularAutomaton().getGrainIdField();
    const grainOrientationField = this.microstructure.getCellularAutomaton().getGrainOrientationField();
    const coolingRateField = this.microstructure.getCoolingRateField();

    const heatmapCanvas = document.createElement('canvas');
    heatmapCanvas.width = this.gridResolution;
    heatmapCanvas.height = this.gridResolution;
    const heatmapCtx = heatmapCanvas.getContext('2d');
    const heatmapData = heatmapCtx.createImageData(this.gridResolution, this.gridResolution);

    let maxValue = 0;
    for (let y = 0; y < this.gridResolution; y++) {
      for (let x = 0; x < this.gridResolution; x++) {
        if (this.displayOptions.viewMode === 'grainSize') {
          maxValue = Math.max(maxValue, grainSizeMap[y][x]);
        } else if (this.displayOptions.viewMode === 'cooling') {
          maxValue = Math.max(maxValue, coolingRateField[y][x]);
        }
      }
    }

    for (let y = 0; y < this.gridResolution; y++) {
      for (let x = 0; x < this.gridResolution; x++) {
        const idx = (y * this.gridResolution + x) * 4;
        
        if (grainIdField[y][x] !== -1) {
          let hue, rgb;
          
          if (this.displayOptions.viewMode === 'grainSize') {
            const grainSize = grainSizeMap[y][x];
            const normalizedSize = Math.min(1, grainSize / Math.max(1, maxValue));
            hue = (1 - normalizedSize) * 120;
            rgb = this.hslToRgb(hue, 70, 50);
          } else if (this.displayOptions.viewMode === 'orientation') {
            const orientation = grainOrientationField[y][x];
            hue = ((orientation + 180) % 360);
            rgb = this.hslToRgb(hue, 70, 50);
          } else if (this.displayOptions.viewMode === 'cooling') {
            const coolingRate = Math.max(0, coolingRateField[y][x]);
            const normalizedCR = Math.min(1, coolingRate / Math.max(1, maxValue));
            hue = (1 - normalizedCR) * 240;
            rgb = this.hslToRgb(hue, 70, 50);
          }
          
          heatmapData.data[idx] = rgb.r;
          heatmapData.data[idx + 1] = rgb.g;
          heatmapData.data[idx + 2] = rgb.b;
          heatmapData.data[idx + 3] = 255;
        } else {
          heatmapData.data[idx] = 30;
          heatmapData.data[idx + 1] = 58;
          heatmapData.data[idx + 2] = 95;
          heatmapData.data[idx + 3] = 255;
        }
      }
    }

    heatmapCtx.putImageData(heatmapData, 0, 0);
    ctx.drawImage(heatmapCanvas, 0, 0, this.grainWidth, this.grainHeight);
  }

  renderOrientationCanvas() {
    const ctx = this.orientationCtx;
    ctx.clearRect(0, 0, 800, 600);

    const grainOrientationField = this.microstructure.getCellularAutomaton().getGrainOrientationField();
    const grainIdField = this.microstructure.getCellularAutomaton().getGrainIdField();

    const centerX = 400;
    const centerY = 300;
    const radius = 200;

    ctx.fillStyle = '#0a0a0f';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * i / 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    for (let i = 0; i < 8; i++) {
      const angle = (i * 45) * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius
      );
      ctx.stroke();
    }

    const orientationBins = {};
    const grainOrientations = {};

    for (let y = 0; y < this.gridResolution; y++) {
      for (let x = 0; x < this.gridResolution; x++) {
        const gid = grainIdField[y][x];
        if (gid !== -1) {
          if (!grainOrientations[gid]) {
            grainOrientations[gid] = [];
          }
          grainOrientations[gid].push(grainOrientationField[y][x]);
        }
      }
    }

    for (const gid in grainOrientations) {
      const oris = grainOrientations[gid];
      const avgOri = oris.reduce((a, b) => a + b, 0) / oris.length;
      const bin = Math.round(avgOri / 10) * 10;
      orientationBins[bin] = (orientationBins[bin] || 0) + 1;
    }

    const maxCount = Math.max(...Object.values(orientationBins), 1);

    for (const bin in orientationBins) {
      const angle = parseInt(bin) * Math.PI / 180;
      const count = orientationBins[bin];
      const normalizedCount = count / maxCount;
      const pointRadius = radius * 0.1 + radius * 0.8 * normalizedCount;

      const hue = ((parseInt(bin) + 180) % 360);
      ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
      ctx.beginPath();
      ctx.arc(
        centerX + Math.cos(angle) * pointRadius * 0.5,
        centerY + Math.sin(angle) * pointRadius * 0.5,
        4 + normalizedCount * 8,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('晶粒取向极图 (极坐标)', centerX, 50);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText(`总晶粒数: ${Object.keys(grainOrientations).length}`, centerX, 70);
  }

  playAnimation() {
    if (this.animationFrames.length === 0) {
      this.updateStatus('没有动画帧，请先运行模拟');
      return;
    }

    this.isAnimationPlaying = true;
    document.getElementById('playAnimation').disabled = true;
    document.getElementById('pauseAnimation').disabled = false;

    this.animationIntervalId = setInterval(() => {
      if (this.animationFrameIndex >= this.animationFrames.length) {
        this.animationFrameIndex = 0;
      }

      this.renderAnimationFrame(this.animationFrames[this.animationFrameIndex]);
      this.animationFrameIndex++;

      document.getElementById('animFrameInfo').textContent = 
        `帧数: ${this.animationFrameIndex} / ${this.animationFrames.length}`;
      document.getElementById('animTimeInfo').textContent = 
        `模拟时间: ${(this.animationFrames[this.animationFrameIndex - 1]?.timeStep * 0.01 || 0).toFixed(2)} s`;

    }, 100 / this.animationPlaybackSpeed);
  }

  pauseAnimation() {
    this.isAnimationPlaying = false;
    document.getElementById('playAnimation').disabled = false;
    document.getElementById('pauseAnimation').disabled = true;

    if (this.animationIntervalId) {
      clearInterval(this.animationIntervalId);
      this.animationIntervalId = null;
    }
  }

  resetAnimation() {
    this.pauseAnimation();
    this.animationFrameIndex = 0;
    
    if (this.animationFrames.length > 0) {
      this.renderAnimationFrame(this.animationFrames[0]);
    }
    
    document.getElementById('animFrameInfo').textContent = 
      `帧数: 0 / ${this.animationFrames.length}`;
    document.getElementById('animTimeInfo').textContent = '模拟时间: 0.00 s';
  }

  renderAnimationFrame(frame) {
    const ctx = this.animationCtx;
    ctx.clearRect(0, 0, 800, 500);

    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(0, 0, 800, 500);

    const imageData = ctx.createImageData(800, 500);
    const data = imageData.data;
    const cellSize = 800 / this.gridResolution;

    const Tm = this.materialProps.Tm;
    const Ts = this.materialProps.Ts;
    const Ac1 = this.materialProps.Ac1;

    const grainIdField = frame.microData.grainIdField;

    for (let y = 0; y < this.gridResolution; y++) {
      for (let x = 0; x < this.gridResolution; x++) {
        const T = frame.temperatureField[y][x];
        const grainIdx = grainIdField[y][x];

        let r, g, b;

        if (T >= Tm) {
          const intensity = Math.min(1, (T - Tm) / 500);
          r = 255;
          g = Math.floor(107 + intensity * 80);
          b = Math.floor(53 + intensity * 50);
        } else if (T >= Ac1 && T < Tm) {
          const ratio = (T - Ac1) / (Tm - Ac1);
          r = 255;
          g = Math.floor(217 * ratio + 150 * (1 - ratio));
          b = Math.floor(61 * ratio);
        } else if (T < Ts && grainIdx !== -1) {
          const grainColor = this.grainColors[grainIdx % this.grainColors.length];
          const match = grainColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
          if (match) {
            const h = parseInt(match[1]);
            const s = parseInt(match[2]);
            const l = parseInt(match[3]);
            const rgb = this.hslToRgb(h, s, l);
            r = rgb.r;
            g = rgb.g;
            b = rgb.b;
          }
        } else {
          r = 30;
          g = 58;
          b = 95;
        }

        const startX = Math.floor(x * cellSize);
        const startY = Math.floor(y * cellSize);
        const endX = Math.floor((x + 1) * cellSize);
        const endY = Math.floor((y + 1) * cellSize);

        for (let py = startY; py < endY && py < 500; py++) {
          for (let px = startX; px < endX && px < 800; px++) {
            const idx = (py * 800 + px) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const torchX = frame.torchPosition;
    const torchY = 250;
    
    if (torchX > -30 && torchX < 830) {
      const gradient = ctx.createRadialGradient(torchX, torchY, 0, torchX, torchY, 80);
      gradient.addColorStop(0, 'rgba(255, 200, 50, 0.6)');
      gradient.addColorStop(1, 'rgba(255, 50, 50, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(torchX, torchY, 80, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  async analyzeProcess() {
    this.updateStatus('正在分析工艺参数...');

    try {
      const metalloData = this.microstructure.calculateQuantitativeMetallography();
      
      const response = await fetch('/api/process/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          params: this.params,
          metallography_data: metalloData
        })
      });

      const result = await response.json();
      this.currentAnalysis = result;
      this.displayAnalysisResult(result);
      this.updateStatus('工艺分析完成');
    } catch (e) {
      this.updateStatus('分析失败: ' + e.message, 'error');
    }
  }

  displayAnalysisResult(result) {
    const { evaluation, suggestions, optimalParams } = result;

    document.getElementById('totalScore').textContent = evaluation.totalScore;
    document.getElementById('gradeLetter').textContent = evaluation.grade.letter;
    document.getElementById('gradeLabel').textContent = evaluation.grade.label;

    const gradeColors = {
      'A': '#6bcb77',
      'B': '#4d96ff',
      'C': '#ffd93d',
      'D': '#f59e0b',
      'F': '#ef4444'
    };
    document.getElementById('gradeLetter').style.color = gradeColors[evaluation.grade.letter] || '#9ca3af';

    const predictions = evaluation.predictions;
    document.getElementById('predYieldStrength').textContent = predictions.yieldStrength;
    document.getElementById('predUTS').textContent = predictions.ultimateTensileStrength;
    document.getElementById('predElongation').textContent = predictions.elongation;
    document.getElementById('predHardness').textContent = predictions.hardness;
    document.getElementById('predImpact').textContent = predictions.impactEnergy;
    document.getElementById('predFatigue').textContent = predictions.fatigueLimit;

    this.updateScoreBar('Yield', evaluation.scores.yieldStrength);
    this.updateScoreBar('Elongation', evaluation.scores.elongation);
    this.updateScoreBar('Grain', evaluation.scores.grainSize);
    this.updateScoreBar('Columnar', evaluation.scores.columnarRatio);

    this.displaySuggestions(suggestions);
    this.displayRecommendation(optimalParams);
  }

  updateScoreBar(name, score) {
    const bar = document.getElementById(`scoreBar${name}`);
    const value = document.getElementById(`scoreValue${name}`);
    
    bar.style.width = `${(score.score / score.weight) * 100}%`;
    value.textContent = `${score.score}/${score.weight}`;

    const percentage = score.score / score.weight;
    if (percentage >= 0.8) {
      bar.style.background = 'linear-gradient(90deg, #6bcb77, #4ade80)';
    } else if (percentage >= 0.6) {
      bar.style.background = 'linear-gradient(90deg, #ffd93d, #f59e0b)';
    } else {
      bar.style.background = 'linear-gradient(90deg, #ef4444, #f59e0b)';
    }
  }

  displaySuggestions(suggestions) {
    const list = document.getElementById('suggestionsList');
    list.innerHTML = '';

    for (const sug of suggestions) {
      const item = document.createElement('div');
      item.className = `suggestion-item ${sug.priority}`;
      
      let actionHtml = '';
      if (sug.action) {
        const actions = [];
        if (sug.action.weldingSpeed) {
          actions.push(`焊接速度: ${sug.action.weldingSpeed.toFixed(1)} mm/s`);
        }
        if (sug.action.heatInput) {
          actions.push(`热输入: ${sug.action.heatInput.toFixed(1)} kJ/cm`);
        }
        if (actions.length > 0) {
          actionHtml = `<div class="suggestion-action">建议调整: ${actions.join(', ')}</div>`;
        }
      }

      item.innerHTML = `
        <div class="suggestion-title">${sug.title}</div>
        <div class="suggestion-description">${sug.description}</div>
        ${actionHtml}
      `;
      
      list.appendChild(item);
    }
  }

  displayRecommendation(optimalParams) {
    const content = document.getElementById('recommendationContent');
    content.innerHTML = `
      <p style="margin-bottom: 12px; color: #9ca3af; font-size: 12px;">${optimalParams.explanation}</p>
      <div class="recommendation-params">
        <div class="recommendation-param">
          <span>焊接速度</span>
          <span>${optimalParams.recommended.weldingSpeed.toFixed(1)} mm/s</span>
        </div>
        <div class="recommendation-param">
          <span>热输入</span>
          <span>${optimalParams.recommended.heatInput.toFixed(1)} kJ/cm</span>
        </div>
        <div class="recommendation-param">
          <span>预热温度</span>
          <span>${optimalParams.recommended.preheatTemp.toFixed(0)} °C</span>
        </div>
      </div>
      <div style="margin-top: 15px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
        <p style="color: #9ca3af; font-size: 11px; margin-bottom: 8px;">预期效果:</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
          <span>晶粒尺寸: ${optimalParams.expectedOutcome.averageGrainSize.toFixed(1)} μm</span>
          <span>屈服强度: ${optimalParams.expectedOutcome.yieldStrength} MPa</span>
          <span>延伸率: ${optimalParams.expectedOutcome.elongation}%</span>
          <span>评分: ${optimalParams.expectedOutcome.score}/100</span>
        </div>
      </div>
    `;
  }

  updateInfo() {
    const metalloData = this.microstructure.calculateQuantitativeMetallography();
    const coolingStats = this.microstructure.getCoolingRateStats();
    const nucleationStats = this.microstructure.getNucleationModel().getNucleationStats();

    document.getElementById('infoTimeStep').textContent = this.timeStep;
    document.getElementById('infoTorchPos').textContent = (this.torchPosition * 0.1).toFixed(1);
    document.getElementById('infoGrainCount').textContent = metalloData.grainCount;
    document.getElementById('infoAvgGrainSize').textContent = metalloData.averageGrainSize.toFixed(2);
    document.getElementById('infoColumnarRatio').textContent = (metalloData.columnarGrainRatio * 100).toFixed(1);
    document.getElementById('infoCoolingRate').textContent = coolingStats.avg.toFixed(1);
    document.getElementById('infoNucleationCount').textContent = nucleationStats.totalEvents;
  }

  updateStatus(message, type = '') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
  }

  async saveParams() {
    try {
      const response = await fetch('/api/params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          welding_speed: this.params.weldingSpeed,
          heat_input: this.params.heatInput
        })
      });
      const result = await response.json();
      this.currentParamsId = result.id;
      this.updateStatus(`参数已保存 (ID: ${result.id})`);
    } catch (e) {
      this.updateStatus('保存参数失败: ' + e.message, 'error');
    }
  }

  async saveSnapshot() {
    try {
      if (this.currentParamsId === null) {
        await this.saveParams();
      }

      const microData = this.microstructure.exportMicrostructureData();
      const metalloData = microData.quantitativeMetallography;
      const coolingStats = microData.coolingRateStats;

      const snapshot = {
        params_id: this.currentParamsId,
        time_step: this.timeStep,
        pool_data: this.temperatureField,
        grain_data: microData.grainIdField,
        solidification_front: microData.phaseField,
        metallography_data: metalloData,
        cooling_rate_data: coolingStats,
        average_grain_size: metalloData.averageGrainSize,
        grain_count: metalloData.grainCount,
        columnar_grain_ratio: metalloData.columnarGrainRatio,
        max_grain_size: metalloData.maxGrainSize,
        min_grain_size: metalloData.minGrainSize,
        avg_cooling_rate: coolingStats.avg,
        solidification_rate: this.timeStep * 0.01
      };

      const response = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
      });
      const result = await response.json();
      this.updateStatus(`快照已保存 (ID: ${result.id})`);
    } catch (e) {
      this.updateStatus('保存快照失败: ' + e.message, 'error');
    }
  }

  async loadHistory() {
    try {
      const response = await fetch('/api/params');
      const params = await response.json();
      
      const historyList = document.getElementById('historyList');
      historyList.innerHTML = '';

      for (const param of params) {
        const snapshotResponse = await fetch(`/api/snapshots?params_id=${param.id}`);
        const snapshots = await snapshotResponse.json();

        const paramItem = document.createElement('div');
        paramItem.className = 'history-item';
        paramItem.innerHTML = `
          <div class="history-title">参数组 #${param.id}</div>
          <div class="history-details">
            速度: ${param.welding_speed} mm/s | 
            热输入: ${param.heat_input} kJ/cm
          </div>
        `;

        if (snapshots.length > 0) {
          const snapshotList = document.createElement('div');
          snapshotList.className = 'snapshot-list';
          
          for (const snap of snapshots) {
            const snapItem = document.createElement('div');
            snapItem.className = 'snapshot-item';
            snapItem.innerHTML = `
              <div>快照 #${snap.id} - 时间步: ${snap.time_step}</div>
              <div class="snapshot-metrics">
                平均晶粒尺寸: ${snap.average_grain_size?.toFixed(2) || 'N/A'} μm | 
                柱状晶比例: ${snap.columnar_grain_ratio ? (snap.columnar_grain_ratio * 100).toFixed(1) : 'N/A'}% | 
                晶粒数量: ${snap.grain_count || 'N/A'}
              </div>
            `;
            snapshotList.appendChild(snapItem);
          }
          paramItem.appendChild(snapshotList);
        }

        historyList.appendChild(paramItem);
      }

      this.updateStatus(`已加载 ${params.length} 组历史参数`);
    } catch (e) {
      this.updateStatus('加载历史失败: ' + e.message, 'error');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.simulation = new WeldPoolSimulation();
});
