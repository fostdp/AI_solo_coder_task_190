class PhaseFieldModel {
  constructor(gridResolution, materialProps) {
    this.gridResolution = gridResolution;
    this.materialProps = materialProps;
    this.phaseField = [];
    this.init();
  }

  init() {
    this.phaseField = [];
    for (let y = 0; y < this.gridResolution; y++) {
      this.phaseField[y] = [];
      for (let x = 0; x < this.gridResolution; x++) {
        this.phaseField[y][x] = 1;
      }
    }
  }

  update(temperatureField) {
    const Tm = this.materialProps.Tm;
    const Ts = this.materialProps.Ts;

    for (let y = 0; y < this.gridResolution; y++) {
      for (let x = 0; x < this.gridResolution; x++) {
        const T = temperatureField[y][x];
        let targetPhase;

        if (T >= Tm) {
          targetPhase = 1;
        } else if (T <= Ts) {
          targetPhase = 0;
        } else {
          targetPhase = (T - Ts) / (Tm - Ts);
        }

        if (targetPhase < this.phaseField[y][x]) {
          this.phaseField[y][x] = Math.max(0, this.phaseField[y][x] - 0.05);
        } else {
          this.phaseField[y][x] = Math.min(1, this.phaseField[y][x] + 0.1);
        }
      }
    }
  }

  getPhase(y, x) {
    return this.phaseField[y][x];
  }

  isSolidifying(y, x) {
    return this.phaseField[y][x] > 0 && this.phaseField[y][x] < 0.5;
  }

  isSolid(y, x) {
    return this.phaseField[y][x] < 0.3;
  }

  isLiquid(y, x) {
    return this.phaseField[y][x] > 0.7;
  }

  getData() {
    return this.phaseField;
  }
}

class NucleationModel {
  constructor(gridResolution, materialProps) {
    this.gridResolution = gridResolution;
    this.materialProps = materialProps;
    this.nucleationDensityField = [];
    this.nucleationEventLog = [];
    this.coolingRateDependence = {
      baseNucleation: 0.0005,
      coolingRateCoeff: 0.5,
      coolingRateExponent: 0.7,
      lowGradientBoost: 0.25,
      highGradientBoost: 0.05,
      gradientThreshold: 15,
      maxNucleationRate: 2.0
    };
    this.init();
  }

  init() {
    this.nucleationDensityField = [];
    this.nucleationEventLog = [];
    for (let y = 0; y < this.gridResolution; y++) {
      this.nucleationDensityField[y] = [];
      for (let x = 0; x < this.gridResolution; x++) {
        this.nucleationDensityField[y][x] = 0;
      }
    }
  }

  calculateNucleationRate(coolingRate, tempGradMag) {
    const { baseNucleation, coolingRateCoeff, coolingRateExponent,
            lowGradientBoost, highGradientBoost, gradientThreshold, maxNucleationRate } = this.coolingRateDependence;
    
    const coolingRateEffect = Math.pow(Math.max(1, coolingRate) / 100, coolingRateExponent) * coolingRateCoeff;
    const tempGradEffect = tempGradMag < gradientThreshold ? lowGradientBoost : highGradientBoost;
    
    return Math.min(maxNucleationRate, baseNucleation + coolingRateEffect + tempGradEffect);
  }

  calculateNucleationDensity(coolingRate) {
    const nucleationRate = this.calculateNucleationRate(coolingRate, 0);
    return nucleationRate * 1e7;
  }

  predictGrainSizeFromCoolingRate(coolingRate) {
    const nucleationDensity = this.calculateNucleationDensity(coolingRate);
    const grainSpacing = 1 / Math.sqrt(nucleationDensity);
    return grainSpacing * 2.5 * 1000;
  }

  updateNucleationDensityField(coolingRateField, tempGradMagnitudeField) {
    for (let y = 0; y < this.gridResolution; y++) {
      for (let x = 0; x < this.gridResolution; x++) {
        const coolingRate = Math.max(0, coolingRateField[y][x]);
        this.nucleationDensityField[y][x] = this.calculateNucleationDensity(coolingRate);
      }
    }
  }

  logNucleationEvent(x, y, grainId, coolingRate, tempGradMag, orientation) {
    this.nucleationEventLog.push({
      x, y, grainId, coolingRate, tempGradMag, orientation,
      timestamp: Date.now(),
      nucleationRate: this.calculateNucleationRate(coolingRate, tempGradMag),
      predictedGrainSize: this.predictGrainSizeFromCoolingRate(coolingRate)
    });
  }

  getNucleationDensity(y, x) {
    return this.nucleationDensityField[y][x];
  }

  getNucleationEventCount() {
    return this.nucleationEventLog.length;
  }

  getNucleationStats() {
    if (this.nucleationEventLog.length === 0) {
      return { totalEvents: 0, avgCoolingRate: 0, avgPredictedSize: 0 };
    }

    const totalCoolingRate = this.nucleationEventLog.reduce((sum, e) => sum + e.coolingRate, 0);
    const totalPredictedSize = this.nucleationEventLog.reduce((sum, e) => sum + e.predictedGrainSize, 0);

    return {
      totalEvents: this.nucleationEventLog.length,
      avgCoolingRate: totalCoolingRate / this.nucleationEventLog.length,
      avgPredictedSize: totalPredictedSize / this.nucleationEventLog.length
    };
  }

  getCoolingRateDependenceParams() {
    return { ...this.coolingRateDependence };
  }

  setCoolingRateDependenceParams(params) {
    Object.assign(this.coolingRateDependence, params);
  }
}

class GrainSizeModel {
  constructor(gridResolution, materialProps, cellSize) {
    this.gridResolution = gridResolution;
    this.materialProps = materialProps;
    this.cellSize = cellSize;
    this.grainSizeMap = [];
    this.grainCellCounts = {};
    this.grainCoolingRateMap = {};
    this.grainGrowthHistory = {};
    this.init();
  }

  init() {
    this.grainSizeMap = [];
    this.grainCellCounts = {};
    this.grainCoolingRateMap = {};
    this.grainGrowthHistory = {};
    for (let y = 0; y < this.gridResolution; y++) {
      this.grainSizeMap[y] = [];
      for (let x = 0; x < this.gridResolution; x++) {
        this.grainSizeMap[y][x] = 0;
      }
    }
  }

  updateCellCount(grainId) {
    if (!this.grainCellCounts[grainId]) {
      this.grainCellCounts[grainId] = 0;
    }
    this.grainCellCounts[grainId]++;
  }

  updateGrainCoolingRate(grainId, coolingRate) {
    if (!this.grainCoolingRateMap[grainId]) {
      this.grainCoolingRateMap[grainId] = { total: 0, count: 0 };
    }
    this.grainCoolingRateMap[grainId].total += coolingRate;
    this.grainCoolingRateMap[grainId].count++;
  }

  getAverageCoolingRateForGrain(grainId) {
    const data = this.grainCoolingRateMap[grainId];
    if (!data || data.count === 0) return 0;
    return data.total / data.count;
  }

  calculateGrainSizeFromCellCount(cellCount) {
    return Math.sqrt(cellCount) * this.cellSize;
  }

  updateGrainSizeMap(grainIdField) {
    this.grainCellCounts = {};
    
    for (let y = 0; y < this.gridResolution; y++) {
      for (let x = 0; x < this.gridResolution; x++) {
        const gid = grainIdField[y][x];
        if (gid !== -1) {
          if (!this.grainCellCounts[gid]) {
            this.grainCellCounts[gid] = 0;
          }
          this.grainCellCounts[gid]++;
        }
      }
    }

    for (let y = 0; y < this.gridResolution; y++) {
      for (let x = 0; x < this.gridResolution; x++) {
        const gid = grainIdField[y][x];
        if (gid !== -1 && this.grainCellCounts[gid]) {
          this.grainSizeMap[y][x] = this.calculateGrainSizeFromCellCount(this.grainCellCounts[gid]);
        } else {
          this.grainSizeMap[y][x] = 0;
        }
      }
    }
  }

  getGrainSize(y, x) {
    return this.grainSizeMap[y][x];
  }

  getGrainCellCount(grainId) {
    return this.grainCellCounts[grainId] || 0;
  }

  getGrainSizeData(grainIdField) {
    const grainSizes = [];
    for (const gid in this.grainCellCounts) {
      grainSizes.push({
        grainId: parseInt(gid),
        cellCount: this.grainCellCounts[gid],
        size: this.calculateGrainSizeFromCellCount(this.grainCellCounts[gid]),
        avgCoolingRate: this.getAverageCoolingRateForGrain(parseInt(gid))
      });
    }
    return grainSizes;
  }

  getSizeDistribution(grainIdField) {
    const grainSizes = this.getGrainSizeData(grainIdField).map(g => g.size);
    if (grainSizes.length === 0) return [];

    grainSizes.sort((a, b) => a - b);
    
    const binCount = 10;
    const minSize = grainSizes[0];
    const maxSize = grainSizes[grainSizes.length - 1];
    const binSize = (maxSize - minSize) / binCount || 1;

    const bins = [];
    for (let i = 0; i < binCount; i++) {
      const binStart = minSize + i * binSize;
      const binEnd = minSize + (i + 1) * binSize;
      const count = grainSizes.filter(s => s >= binStart && s < binEnd).length;
      bins.push({ binStart, binEnd, count });
    }

    return bins;
  }

  getGrainSizeMapData() {
    return this.grainSizeMap;
  }
}

class CellularAutomatonModel {
  constructor(gridResolution, materialProps, nucleationModel, grainSizeModel) {
    this.gridResolution = gridResolution;
    this.materialProps = materialProps;
    this.nucleationModel = nucleationModel;
    this.grainSizeModel = grainSizeModel;
    
    this.grainId = [];
    this.grainOrientation = [];
    this.solidifiedCells = [];
    this.nextGrainId = 0;
    
    this.growthParams = {
      baseGrowthProbability: 0.4,
      columnarGrowthBoost: 0.3,
      columnarGradientThreshold: 30,
      equiaxedCoolingThreshold: 100,
      equiaxedGradientThreshold: 20,
      columnarAngleVariation: 10,
      equiaxedAngleVariation: 60,
      mixedAngleVariation: 30,
      columnarOrientationWeight: 3.0
    };

    this.init();
  }

  init() {
    this.grainId = [];
    this.grainOrientation = [];
    this.solidifiedCells = [];
    this.nextGrainId = 0;

    for (let y = 0; y < this.gridResolution; y++) {
      this.grainId[y] = [];
      this.grainOrientation[y] = [];
      for (let x = 0; x < this.gridResolution; x++) {
        this.grainId[y][x] = -1;
        this.grainOrientation[y][x] = -1;
      }
    }
  }

  calculateGrowthProbability(coolingRate, tempGradMag) {
    const { baseGrowthProbability, columnarGrowthBoost, columnarGradientThreshold } = this.growthParams;
    const columnarBoost = tempGradMag > columnarGradientThreshold ? columnarGrowthBoost : 0;
    const coolingRateEffect = Math.max(-0.15, -coolingRate / 500);
    return Math.max(0.15, Math.min(0.9, baseGrowthProbability + columnarBoost + coolingRateEffect));
  }

  getSolidNeighbors(y, x, phaseField) {
    const neighbors = [
      [y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1],
      [y - 1, x - 1], [y - 1, x + 1], [y + 1, x - 1], [y + 1, x + 1]
    ];

    const solidNeighbors = [];
    for (const [ny, nx] of neighbors) {
      if (ny >= 0 && ny < this.gridResolution && nx >= 0 && nx < this.gridResolution) {
        if (this.grainId[ny][nx] !== -1 && phaseField[ny][nx] < 0.3) {
          solidNeighbors.push({
            ny, nx,
            id: this.grainId[ny][nx],
            ori: this.grainOrientation[ny][nx]
          });
        }
      }
    }
    return solidNeighbors;
  }

  calculateTemperatureGradient(x, y, temperatureField) {
    const dx = 2;
    const dTdx = (temperatureField[y][Math.min(x + dx, this.gridResolution - 1)] -
                  temperatureField[y][Math.max(x - dx, 0)]) / (2 * dx);
    const dTdy = (temperatureField[Math.min(y + dx, this.gridResolution - 1)][x] -
                  temperatureField[Math.max(y - dx, 0)][x]) / (2 * dx);
    return { x: dTdx, y: dTdy, magnitude: Math.sqrt(dTdx * dTdx + dTdy * dTdy) };
  }

  selectPreferredGrain(neighbors, tempGrad, isColumnarZone = false) {
    let bestNeighbor = neighbors[0];
    let bestScore = -Infinity;

    const tempGradAngle = Math.atan2(tempGrad.y, tempGrad.x) * 180 / Math.PI;
    const columnarWeight = isColumnarZone ? this.growthParams.columnarOrientationWeight : 1.0;

    for (const neighbor of neighbors) {
      const angleDiff = Math.abs(((neighbor.ori - tempGradAngle + 270) % 360) - 180);
      const alignmentScore = 180 - angleDiff;
      const score = alignmentScore * (1 + tempGrad.magnitude * 0.01 * columnarWeight);

      if (score > bestScore) {
        bestScore = score;
        bestNeighbor = neighbor;
      }
    }

    return bestNeighbor;
  }

  determineZoneType(coolingRate, tempGradMag) {
    const { columnarGradientThreshold, equiaxedCoolingThreshold, equiaxedGradientThreshold } = this.growthParams;
    
    if (tempGradMag > columnarGradientThreshold) {
      return 'columnar';
    } else if (coolingRate > equiaxedCoolingThreshold && tempGradMag < equiaxedGradientThreshold) {
      return 'equiaxed';
    }
    return 'mixed';
  }

  update(temperatureField, phaseField, coolingRateField, tempGradMagnitudeField) {
    const Ts = this.materialProps.Ts;
    const newGrainOrientation = this.grainOrientation.map(row => [...row]);
    const newGrainId = this.grainId.map(row => [...row]);

    for (let y = 1; y < this.gridResolution - 1; y++) {
      for (let x = 1; x < this.gridResolution - 1; x++) {
        if (temperatureField[y][x] <= Ts && phaseField[y][x] < 0.3 && this.grainId[y][x] === -1) {
          const coolingRate = Math.max(0, coolingRateField[y][x]);
          const tempGradMag = tempGradMagnitudeField[y][x];
          const zoneType = this.determineZoneType(coolingRate, tempGradMag);
          const isColumnarZone = zoneType === 'columnar';
          
          const nucleationRate = this.nucleationModel.calculateNucleationRate(coolingRate, tempGradMag);
          const growthProbability = this.calculateGrowthProbability(coolingRate, tempGradMag);
          const solidNeighbors = this.getSolidNeighbors(y, x, phaseField);

          if (solidNeighbors.length > 0 && Math.random() < growthProbability) {
            const tempGrad = this.calculateTemperatureGradient(x, y, temperatureField);
            const preferredNeighbor = this.selectPreferredGrain(solidNeighbors, tempGrad, isColumnarZone);

            newGrainId[y][x] = preferredNeighbor.id;
            let angleVariation;
            
            switch (zoneType) {
              case 'columnar':
                angleVariation = (Math.random() - 0.5) * this.growthParams.columnarAngleVariation;
                break;
              case 'equiaxed':
                angleVariation = (Math.random() - 0.5) * this.growthParams.equiaxedAngleVariation;
                break;
              default:
                angleVariation = (Math.random() - 0.5) * this.growthParams.mixedAngleVariation;
            }
            
            newGrainOrientation[y][x] = preferredNeighbor.ori + angleVariation;
            this.solidifiedCells.push({ x, y, type: 'growth' });
            this.grainSizeModel.updateCellCount(preferredNeighbor.id);
            this.grainSizeModel.updateGrainCoolingRate(preferredNeighbor.id, coolingRate);
            
          } else if (Math.random() < nucleationRate) {
            const baseOrientation = isColumnarZone ? -90 : (Math.random() - 0.5) * 180;
            const oriVariation = isColumnarZone ? (Math.random() - 0.5) * 20 : (Math.random() - 0.5) * 90;
            const newId = this.nextGrainId++;
            
            newGrainId[y][x] = newId;
            newGrainOrientation[y][x] = baseOrientation + oriVariation;
            this.solidifiedCells.push({ x, y, type: 'nucleation' });
            
            this.nucleationModel.logNucleationEvent(x, y, newId, coolingRate, tempGradMag, newGrainOrientation[y][x]);
            this.grainSizeModel.updateCellCount(newId);
            this.grainSizeModel.updateGrainCoolingRate(newId, coolingRate);
          }
        }
      }
    }

    this.grainOrientation = newGrainOrientation;
    this.grainId = newGrainId;
  }

  getGrainId(y, x) {
    return this.grainId[y][x];
  }

  getGrainOrientation(y, x) {
    return this.grainOrientation[y][x];
  }

  getGrainIdField() {
    return this.grainId;
  }

  getGrainOrientationField() {
    return this.grainOrientation;
  }

  getSolidifiedCellCount() {
    return this.solidifiedCells.length;
  }

  getGrowthParams() {
    return { ...this.growthParams };
  }

  setGrowthParams(params) {
    Object.assign(this.growthParams, params);
  }
}

class MicrostructureFramework {
  constructor(gridResolution, materialProps, cellSize) {
    this.gridResolution = gridResolution;
    this.materialProps = materialProps;
    this.cellSize = cellSize;

    this.phaseField = new PhaseFieldModel(gridResolution, materialProps);
    this.nucleationModel = new NucleationModel(gridResolution, materialProps);
    this.grainSizeModel = new GrainSizeModel(gridResolution, materialProps, cellSize);
    this.cellularAutomaton = new CellularAutomatonModel(
      gridResolution, materialProps, this.nucleationModel, this.grainSizeModel
    );

    this.coolingRateField = [];
    this.tempGradMagnitudeField = [];
    this.initAuxiliaryFields();
  }

  initAuxiliaryFields() {
    this.coolingRateField = [];
    this.tempGradMagnitudeField = [];
    for (let y = 0; y < this.gridResolution; y++) {
      this.coolingRateField[y] = [];
      this.tempGradMagnitudeField[y] = [];
      for (let x = 0; x < this.gridResolution; x++) {
        this.coolingRateField[y][x] = 0;
        this.tempGradMagnitudeField[y][x] = 0;
      }
    }
  }

  init() {
    this.phaseField.init();
    this.nucleationModel.init();
    this.grainSizeModel.init();
    this.cellularAutomaton.init();
    this.initAuxiliaryFields();
  }

  updateCoolingRateField(prevTemperatureField, currentTemperatureField, dt = 0.01) {
    for (let y = 0; y < this.gridResolution; y++) {
      for (let x = 0; x < this.gridResolution; x++) {
        const dT = prevTemperatureField[y][x] - currentTemperatureField[y][x];
        this.coolingRateField[y][x] = dT / dt;
      }
    }
  }

  updateTempGradMagnitudeField(temperatureField) {
    for (let y = 0; y < this.gridResolution; y++) {
      for (let x = 0; x < this.gridResolution; x++) {
        const grad = this.cellularAutomaton.calculateTemperatureGradient(x, y, temperatureField);
        this.tempGradMagnitudeField[y][x] = grad.magnitude;
      }
    }
  }

  update(temperatureField, prevTemperatureField) {
    this.updateCoolingRateField(prevTemperatureField, temperatureField);
    this.updateTempGradMagnitudeField(temperatureField);
    this.nucleationModel.updateNucleationDensityField(this.coolingRateField, this.tempGradMagnitudeField);
    this.phaseField.update(temperatureField);
    this.cellularAutomaton.update(
      temperatureField,
      this.phaseField.getData(),
      this.coolingRateField,
      this.tempGradMagnitudeField
    );
    this.grainSizeModel.updateGrainSizeMap(this.cellularAutomaton.getGrainIdField());
  }

  getPhaseField() {
    return this.phaseField;
  }

  getNucleationModel() {
    return this.nucleationModel;
  }

  getGrainSizeModel() {
    return this.grainSizeModel;
  }

  getCellularAutomaton() {
    return this.cellularAutomaton;
  }

  getCoolingRateField() {
    return this.coolingRateField;
  }

  getTempGradMagnitudeField() {
    return this.tempGradMagnitudeField;
  }

  calculateQuantitativeMetallography() {
    const grainIdField = this.cellularAutomaton.getGrainIdField();
    const grainOrientationField = this.cellularAutomaton.getGrainOrientationField();
    
    const grainCells = {};
    const grainOrientations = {};
    let totalSolidifiedCells = 0;

    for (let y = 0; y < this.gridResolution; y++) {
      for (let x = 0; x < this.gridResolution; x++) {
        const gid = grainIdField[y][x];
        if (gid !== -1) {
          if (!grainCells[gid]) {
            grainCells[gid] = [];
            grainOrientations[gid] = [];
          }
          grainCells[gid].push({ x, y });
          grainOrientations[gid].push(grainOrientationField[y][x]);
          totalSolidifiedCells++;
        }
      }
    }

    const grainCount = Object.keys(grainCells).length;
    if (grainCount === 0) {
      return {
        averageGrainSize: 0,
        grainCount: 0,
        totalSolidifiedArea: 0,
        grainSizeDistribution: [],
        averageOrientation: 0,
        columnarGrainRatio: 0,
        equiaxedGrainRatio: 0,
        maxGrainSize: 0,
        minGrainSize: 0,
        nucleationEventCount: 0,
        avgNucleationCoolingRate: 0
      };
    }

    const grainSizes = this.grainSizeModel.getGrainSizeData(grainIdField);
    const sizeValues = grainSizes.map(g => g.size);
    sizeValues.sort((a, b) => a - b);
    
    const averageGrainSize = sizeValues.reduce((a, b) => a + b, 0) / sizeValues.length;
    const maxGrainSize = sizeValues[sizeValues.length - 1];
    const minGrainSize = sizeValues[0];

    let columnarCount = 0;
    let equiaxedCount = 0;

    for (const gid in grainOrientations) {
      const oris = grainOrientations[gid];
      const oriVariance = this.calculateVariance(oris);
      if (oriVariance < 400) {
        columnarCount++;
      } else {
        equiaxedCount++;
      }
    }

    const nucleationStats = this.nucleationModel.getNucleationStats();

    return {
      averageGrainSize: parseFloat(averageGrainSize.toFixed(3)),
      grainCount,
      totalSolidifiedArea: parseFloat((totalSolidifiedCells * this.cellSize * this.cellSize).toFixed(3)),
      grainSizeDistribution: this.grainSizeModel.getSizeDistribution(grainIdField),
      averageOrientation: parseFloat((grainOrientations[Object.keys(grainCells)[0]]?.reduce((a, b) => a + b, 0) / grainOrientations[Object.keys(grainCells)[0]]?.length || 0).toFixed(2)),
      columnarGrainRatio: parseFloat((columnarCount / grainCount).toFixed(3)),
      equiaxedGrainRatio: parseFloat((equiaxedCount / grainCount).toFixed(3)),
      maxGrainSize: parseFloat(maxGrainSize.toFixed(3)),
      minGrainSize: parseFloat(minGrainSize.toFixed(3)),
      nucleationEventCount: nucleationStats.totalEvents,
      avgNucleationCoolingRate: parseFloat(nucleationStats.avgCoolingRate.toFixed(2)),
      grainSizesWithCoolingRate: grainSizes
    };
  }

  calculateVariance(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  getCoolingRateStats() {
    const allCoolingRates = [];
    for (let y = 0; y < this.gridResolution; y++) {
      for (let x = 0; x < this.gridResolution; x++) {
        if (this.coolingRateField[y][x] > 0) {
          allCoolingRates.push(this.coolingRateField[y][x]);
        }
      }
    }

    if (allCoolingRates.length === 0) {
      return { avg: 0, max: 0, min: 0, count: 0 };
    }

    return {
      avg: allCoolingRates.reduce((a, b) => a + b, 0) / allCoolingRates.length,
      max: Math.max(...allCoolingRates),
      min: Math.min(...allCoolingRates),
      count: allCoolingRates.length
    };
  }

  exportMicrostructureData() {
    return {
      phaseField: this.phaseField.getData(),
      grainIdField: this.cellularAutomaton.getGrainIdField(),
      grainOrientationField: this.cellularAutomaton.getGrainOrientationField(),
      grainSizeMap: this.grainSizeModel.getGrainSizeMapData(),
      coolingRateField: this.coolingRateField,
      tempGradMagnitudeField: this.tempGradMagnitudeField,
      nucleationDensityField: this.nucleationModel.nucleationDensityField,
      quantitativeMetallography: this.calculateQuantitativeMetallography(),
      coolingRateStats: this.getCoolingRateStats(),
      nucleationStats: this.nucleationModel.getNucleationStats(),
      grainSizeData: this.grainSizeModel.getGrainSizeData(this.cellularAutomaton.getGrainIdField())
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PhaseFieldModel,
    NucleationModel,
    GrainSizeModel,
    CellularAutomatonModel,
    MicrostructureFramework
  };
}
