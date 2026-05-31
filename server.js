const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

class MechanicalPropertyPredictor {
  constructor() {
    this.materialProps = {
      k_y: 0.75,
      sigma_0: 150,
      G: 80e9,
      b: 0.248e-9,
      E: 206e9,
      C: 0.2
    };
  }

  predictYieldStrength(averageGrainSize, columnarRatio = 0.5) {
    const d_mm = averageGrainSize;
    const d_m = d_mm * 1e-3;
    const d_micron = d_mm * 1000;

    const grainBoundaryStrength = this.materialProps.k_y / Math.sqrt(d_micron);
    const columnarFactor = 1 - columnarRatio * 0.15;
    const sigma_y = (this.materialProps.sigma_0 + grainBoundaryStrength) * columnarFactor;

    return {
      yieldStrength: Math.round(sigma_y),
      grainBoundaryStrength: Math.round(grainBoundaryStrength),
      columnarEffect: Math.round(columnarRatio * 100),
      unit: 'MPa'
    };
  }

  predictUltimateTensileStrength(yieldStrength) {
    const uts_ratio = 1.3 + Math.random() * 0.1;
    return Math.round(yieldStrength * uts_ratio);
  }

  predictElongation(averageGrainSize, columnarRatio = 0.5) {
    const baseElongation = 25;
    const sizeEffect = Math.max(0, 10 - averageGrainSize * 2);
    const columnarEffect = columnarRatio * 8;
    const elongation = Math.max(5, baseElongation + sizeEffect - columnarEffect);
    return Math.round(elongation * 10) / 10;
  }

  predictHardness(yieldStrength) {
    return Math.round(yieldStrength / 3.5);
  }

  predictImpactEnergy(averageGrainSize, columnarRatio = 0.5) {
    const baseEnergy = 50;
    const sizeEffect = Math.max(0, averageGrainSize * 3);
    const columnarEffect = columnarRatio * 25;
    return Math.max(10, Math.round(baseEnergy + sizeEffect - columnarEffect));
  }

  predictFatigueLimit(yieldStrength) {
    return Math.round(yieldStrength * 0.45);
  }

  predictAll(metallographyData) {
    const avgGrainSize = metallographyData.averageGrainSize || 10;
    const columnarRatio = metallographyData.columnarGrainRatio || 0.5;

    const yieldData = this.predictYieldStrength(avgGrainSize, columnarRatio);
    const uts = this.predictUltimateTensileStrength(yieldData.yieldStrength);
    const elongation = this.predictElongation(avgGrainSize, columnarRatio);
    const hardness = this.predictHardness(yieldData.yieldStrength);
    const impactEnergy = this.predictImpactEnergy(avgGrainSize, columnarRatio);
    const fatigueLimit = this.predictFatigueLimit(yieldData.yieldStrength);

    return {
      yieldStrength: yieldData.yieldStrength,
      ultimateTensileStrength: uts,
      elongation: elongation,
      hardness: hardness,
      impactEnergy: impactEnergy,
      fatigueLimit: fatigueLimit,
      grainBoundaryContribution: yieldData.grainBoundaryStrength,
      columnarEffect: yieldData.columnarEffect,
      units: {
        strength: 'MPa',
        elongation: '%',
        hardness: 'HV',
        impact: 'J',
        fatigue: 'MPa'
      }
    };
  }
}

class ProcessOptimizer {
  constructor() {
    this.targetRanges = {
      yieldStrength: { min: 350, max: 550, optimal: 450 },
      elongation: { min: 15, max: 30, optimal: 22 },
      averageGrainSize: { min: 5, max: 20, optimal: 10 },
      columnarGrainRatio: { min: 0.3, max: 0.7, optimal: 0.5 }
    };
    this.predictor = new MechanicalPropertyPredictor();
  }

  evaluateProcess(params, metallographyData) {
    const predictions = this.predictor.predictAll(metallographyData);
    const scores = {};
    const totalWeight = 100;

    scores.yieldStrength = this.scoreParameter(
      predictions.yieldStrength,
      this.targetRanges.yieldStrength,
      30
    );

    scores.elongation = this.scoreParameter(
      predictions.elongation,
      this.targetRanges.elongation,
      25
    );

    scores.grainSize = this.scoreParameter(
      metallographyData.averageGrainSize,
      this.targetRanges.averageGrainSize,
      25
    );

    scores.columnarRatio = this.scoreParameter(
      metallographyData.columnarGrainRatio,
      this.targetRanges.columnarGrainRatio,
      20
    );

    const totalScore = Object.values(scores).reduce((a, b) => a + b.score, 0);

    return {
      totalScore: Math.round(totalScore),
      maxScore: totalWeight,
      grade: this.getGrade(totalScore, totalWeight),
      scores: scores,
      predictions: predictions
    };
  }

  scoreParameter(value, range, weight) {
    const { min, max, optimal } = range;
    let score = 0;
    let status = 'poor';

    if (value >= min && value <= max) {
      const distance = Math.abs(value - optimal);
      const rangeSize = max - min;
      const normalizedDistance = distance / (rangeSize / 2);
      score = weight * (1 - normalizedDistance * 0.5);
      status = normalizedDistance < 0.3 ? 'excellent' : 'good';
    } else if (value < min) {
      const diff = (min - value) / min;
      score = weight * Math.max(0, 1 - diff * 2);
      status = 'low';
    } else {
      const diff = (value - max) / max;
      score = weight * Math.max(0, 1 - diff * 2);
      status = 'high';
    }

    return { score: Math.round(score * 10) / 10, status, value, weight };
  }

  getGrade(score, maxScore) {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return { letter: 'A', label: '优秀' };
    if (percentage >= 80) return { letter: 'B', label: '良好' };
    if (percentage >= 70) return { letter: 'C', label: '一般' };
    if (percentage >= 60) return { letter: 'D', label: '较差' };
    return { letter: 'F', label: '不合格' };
  }

  suggestOptimizations(params, evaluation) {
    const suggestions = [];

    if (evaluation.scores.yieldStrength.status === 'low') {
      suggestions.push({
        type: 'grain_refinement',
        priority: 'high',
        title: '提高强度',
        description: '屈服强度偏低，建议提高焊接速度或降低热输入以细化晶粒',
        action: {
          weldingSpeed: Math.min(20, params.weldingSpeed * 1.3),
          heatInput: Math.max(2, params.heatInput * 0.85)
        }
      });
    }

    if (evaluation.scores.elongation.status === 'low') {
      suggestions.push({
        type: 'reduce_cooling',
        priority: 'medium',
        title: '提高塑性',
        description: '延伸率偏低，建议降低焊接速度以减少柱状晶比例',
        action: {
          weldingSpeed: Math.max(1, params.weldingSpeed * 0.75),
          heatInput: Math.min(25, params.heatInput * 1.15)
        }
      });
    }

    if (evaluation.scores.columnarRatio.status === 'high') {
      suggestions.push({
        type: 'reduce_columnar',
        priority: 'medium',
        title: '减少柱状晶',
        description: '柱状晶比例过高，建议提高焊接速度或增加预热温度',
        action: {
          weldingSpeed: Math.min(20, params.weldingSpeed * 1.2)
        }
      });
    }

    if (evaluation.scores.yieldStrength.status === 'high') {
      suggestions.push({
        type: 'reduce_strength',
        priority: 'low',
        title: '调整强度',
        description: '强度偏高，可适当降低焊接速度以改善韧性',
        action: {
          weldingSpeed: Math.max(1, params.weldingSpeed * 0.9)
        }
      });
    }

    suggestions.push({
      type: 'general',
      priority: 'info',
      title: '参数平衡建议',
      description: `当前综合评分 ${evaluation.totalScore}/${evaluation.maxScore} (${evaluation.grade.label})，建议在保证强度的前提下优化塑性`,
      action: null
    });

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2, info: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  predictOptimalParams(currentParams) {
    return {
      recommended: {
        weldingSpeed: 8.0,
        heatInput: 8.0,
        preheatTemp: 100
      },
      expectedOutcome: {
        averageGrainSize: 8.5,
        columnarGrainRatio: 0.55,
        yieldStrength: 420,
        elongation: 22,
        score: 88
      },
      explanation: '推荐参数在强度和塑性之间取得平衡，适用于大多数焊接结构应用'
    };
  }
}

class GrainStatisticsAnalyzer {
  constructor() {}

  analyzeGrainSizeDistribution(grainSizeData) {
    if (!grainSizeData || grainSizeData.length === 0) {
      return null;
    }

    const sizes = grainSizeData.map(g => g.size).sort((a, b) => a - b);
    const count = sizes.length;
    const sum = sizes.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    const variance = sizes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    const median = count % 2 === 0
      ? (sizes[count / 2 - 1] + sizes[count / 2]) / 2
      : sizes[Math.floor(count / 2)];

    const bins = this.createHistogram(sizes, 10);

    return {
      count,
      mean: Math.round(mean * 100) / 100,
      median: Math.round(median * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      min: sizes[0],
      max: sizes[sizes.length - 1],
      range: sizes[sizes.length - 1] - sizes[0],
      histogram: bins,
      skewness: this.calculateSkewness(sizes, mean, stdDev)
    };
  }

  createHistogram(data, binCount) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binSize = (max - min) / binCount || 1;
    const bins = [];

    for (let i = 0; i < binCount; i++) {
      const binStart = min + i * binSize;
      const binEnd = min + (i + 1) * binSize;
      const count = data.filter(d => d >= binStart && d < binEnd).length;
      bins.push({
        binStart: Math.round(binStart * 100) / 100,
        binEnd: Math.round(binEnd * 100) / 100,
        count,
        percentage: Math.round((count / data.length) * 1000) / 10
      });
    }
    return bins;
  }

  calculateSkewness(data, mean, stdDev) {
    if (stdDev === 0) return 0;
    const n = data.length;
    const sum = data.reduce((a, b) => a + Math.pow((b - mean) / stdDev, 3), 0);
    return Math.round((sum / n) * 100) / 100;
  }

  analyzeCoolingRateCorrelation(grainSizeData) {
    if (!grainSizeData || grainSizeData.length === 0) return null;

    const validData = grainSizeData.filter(g => g.avgCoolingRate > 0);
    if (validData.length < 2) return null;

    const sizes = validData.map(g => g.size);
    const coolingRates = validData.map(g => g.avgCoolingRate);

    const correlation = this.calculateCorrelation(sizes, coolingRates);

    return {
      sampleCount: validData.length,
      pearsonCorrelation: Math.round(correlation * 1000) / 1000,
      interpretation: this.interpretCorrelation(correlation),
      avgCoolingRate: Math.round(coolingRates.reduce((a, b) => a + b, 0) / coolingRates.length * 10) / 10
    };
  }

  calculateCorrelation(x, y) {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
    const sumX2 = x.reduce((a, b) => a + b * b, 0);
    const sumY2 = y.reduce((a, b) => a + b * b, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  interpretCorrelation(r) {
    const absR = Math.abs(r);
    if (absR >= 0.8) return { strength: '强', direction: r > 0 ? '正相关' : '负相关' };
    if (absR >= 0.5) return { strength: '中等', direction: r > 0 ? '正相关' : '负相关' };
    if (absR >= 0.3) return { strength: '弱', direction: r > 0 ? '正相关' : '负相关' };
    return { strength: '无', direction: '相关' };
  }
}

const predictor = new MechanicalPropertyPredictor();
const optimizer = new ProcessOptimizer();
const analyzer = new GrainStatisticsAnalyzer();

const app = express();
const PORT = 8088;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./weld_simulation.db', (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('数据库连接成功');
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS process_params (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      welding_speed REAL NOT NULL,
      heat_input REAL NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS solidification_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      params_id INTEGER,
      time_step INTEGER NOT NULL,
      pool_data TEXT NOT NULL,
      grain_data TEXT NOT NULL,
      solidification_front TEXT NOT NULL,
      metallography_data TEXT,
      cooling_rate_data TEXT,
      average_grain_size REAL,
      grain_count INTEGER,
      columnar_grain_ratio REAL,
      max_grain_size REAL,
      min_grain_size REAL,
      avg_cooling_rate REAL,
      solidification_rate REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (params_id) REFERENCES process_params(id)
    )
  `);

  db.all('PRAGMA table_info(solidification_snapshots)', [], (err, columns) => {
    if (err) {
      console.log('获取表信息失败:', err.message);
      return;
    }
    const columnNames = columns.map(c => c.name);
    const newColumns = [
      'metallography_data TEXT',
      'cooling_rate_data TEXT',
      'average_grain_size REAL',
      'grain_count INTEGER',
      'columnar_grain_ratio REAL',
      'max_grain_size REAL',
      'min_grain_size REAL',
      'avg_cooling_rate REAL',
      'solidification_rate REAL'
    ];
    for (const colDef of newColumns) {
      const colName = colDef.split(' ')[0];
      if (!columnNames.includes(colName)) {
        db.run(`ALTER TABLE solidification_snapshots ADD COLUMN ${colDef}`, (alterErr) => {
          if (alterErr) {
            console.log(`列 ${colName} 可能已存在或无法添加:`, alterErr.message);
          } else {
            console.log(`已添加列: ${colName}`);
          }
        });
      }
    }
  });
});

app.get('/api/params', (req, res) => {
  db.all('SELECT * FROM process_params ORDER BY timestamp DESC LIMIT 20', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/params', (req, res) => {
  const { welding_speed, heat_input } = req.body;
  db.run(
    'INSERT INTO process_params (welding_speed, heat_input) VALUES (?, ?)',
    [welding_speed, heat_input],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, welding_speed, heat_input });
    }
  );
});

app.get('/api/snapshots', (req, res) => {
  const { params_id } = req.query;
  let query, params;
  const fields = `id, params_id, time_step, average_grain_size, grain_count, 
                  columnar_grain_ratio, max_grain_size, min_grain_size, 
                  avg_cooling_rate, solidification_rate, timestamp`;
  if (params_id) {
    query = `SELECT ${fields} FROM solidification_snapshots WHERE params_id = ? ORDER BY time_step`;
    params = [params_id];
  } else {
    query = `SELECT ${fields} FROM solidification_snapshots ORDER BY timestamp DESC LIMIT 50`;
    params = [];
  }
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/snapshots', (req, res) => {
  const { params_id, time_step, pool_data, grain_data, solidification_front, metallography_data, cooling_rate_data } = req.body;

  const avgGrainSize = metallography_data?.averageGrainSize || null;
  const grainCount = metallography_data?.grainCount || null;
  const columnarRatio = metallography_data?.columnarGrainRatio || null;
  const maxGrainSize = metallography_data?.maxGrainSize || null;
  const minGrainSize = metallography_data?.minGrainSize || null;
  const avgCoolingRate = cooling_rate_data?.averageCoolingRate || null;
  const solidificationRate = metallography_data?.totalSolidifiedArea ? 
    (metallography_data.totalSolidifiedArea / (800 * 500 / 1000000) * 100) : null;

  db.run(
    `INSERT INTO solidification_snapshots 
     (params_id, time_step, pool_data, grain_data, solidification_front, 
      metallography_data, cooling_rate_data, average_grain_size, grain_count, 
      columnar_grain_ratio, max_grain_size, min_grain_size, avg_cooling_rate, solidification_rate) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params_id, time_step, 
      JSON.stringify(pool_data), 
      JSON.stringify(grain_data), 
      JSON.stringify(solidification_front),
      JSON.stringify(metallography_data),
      JSON.stringify(cooling_rate_data),
      avgGrainSize, grainCount, columnarRatio, maxGrainSize, minGrainSize,
      avgCoolingRate, solidificationRate
    ],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ 
        id: this.lastID,
        average_grain_size: avgGrainSize,
        grain_count: grainCount,
        columnar_grain_ratio: columnarRatio
      });
    }
  );
});

app.get('/api/snapshots/:id', (req, res) => {
  db.get('SELECT * FROM solidification_snapshots WHERE id = ?', [req.params.id], (err, snapshot) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (snapshot) {
      snapshot.pool_data = JSON.parse(snapshot.pool_data);
      snapshot.grain_data = JSON.parse(snapshot.grain_data);
      snapshot.solidification_front = JSON.parse(snapshot.solidification_front);
      if (snapshot.metallography_data) {
        snapshot.metallography_data = JSON.parse(snapshot.metallography_data);
      }
      if (snapshot.cooling_rate_data) {
        snapshot.cooling_rate_data = JSON.parse(snapshot.cooling_rate_data);
      }
      res.json(snapshot);
    } else {
      res.status(404).json({ error: 'Snapshot not found' });
    }
  });
});

app.delete('/api/snapshots/:id', (req, res) => {
  db.run('DELETE FROM solidification_snapshots WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Snapshot not found' });
    }
  });
});

app.delete('/api/params/:id', (req, res) => {
  const paramsId = req.params.id;
  db.run('DELETE FROM solidification_snapshots WHERE params_id = ?', [paramsId], (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    db.run('DELETE FROM process_params WHERE id = ?', [paramsId], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes > 0) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Params not found' });
      }
    });
  });
});

app.post('/api/predict/mechanical', (req, res) => {
  try {
    const { metallography_data } = req.body;
    const metalloData = typeof metallography_data === 'string' 
      ? JSON.parse(metallography_data) 
      : metallography_data;
    
    const predictions = predictor.predictAll(metalloData);
    
    res.json({
      success: true,
      predictions: predictions,
      input: metalloData
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/process/evaluate', (req, res) => {
  try {
    const { params, metallography_data } = req.body;
    const metalloData = typeof metallography_data === 'string'
      ? JSON.parse(metallography_data)
      : metallography_data;

    const evaluation = optimizer.evaluateProcess(params, metalloData);
    const suggestions = optimizer.suggestOptimizations(params, evaluation);
    const optimalParams = optimizer.predictOptimalParams(params);

    res.json({
      success: true,
      evaluation: evaluation,
      suggestions: suggestions,
      optimalParams: optimalParams
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/statistics/grain-size', (req, res) => {
  try {
    const { grain_size_data } = req.body;
    const grainSizeData = typeof grain_size_data === 'string'
      ? JSON.parse(grain_size_data)
      : grain_size_data;

    const distribution = analyzer.analyzeGrainSizeDistribution(grainSizeData);
    const correlation = analyzer.analyzeCoolingRateCorrelation(grainSizeData);

    res.json({
      success: true,
      distribution: distribution,
      correlation: correlation
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/snapshots/:id/analysis', (req, res) => {
  db.get('SELECT * FROM solidification_snapshots WHERE id = ?', [req.params.id], (err, snapshot) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!snapshot) {
      res.status(404).json({ error: 'Snapshot not found' });
      return;
    }

    try {
      const metalloData = snapshot.metallography_data ? JSON.parse(snapshot.metallography_data) : {};
      const grainSizeData = metalloData.grainSizesWithCoolingRate || [];

      const predictions = predictor.predictAll(metalloData);
      const distribution = analyzer.analyzeGrainSizeDistribution(grainSizeData);
      const correlation = analyzer.analyzeCoolingRateCorrelation(grainSizeData);

      db.get('SELECT * FROM process_params WHERE id = ?', [snapshot.params_id], (paramErr, params) => {
        if (paramErr || !params) {
          res.json({
            success: true,
            snapshotId: snapshot.id,
            predictions: predictions,
            grainStatistics: distribution,
            coolingCorrelation: correlation,
            params: null,
            evaluation: null
          });
          return;
        }

        const processParams = {
          weldingSpeed: params.welding_speed,
          heatInput: params.heat_input
        };
        const evaluation = optimizer.evaluateProcess(processParams, metalloData);
        const suggestions = optimizer.suggestOptimizations(processParams, evaluation);

        res.json({
          success: true,
          snapshotId: snapshot.id,
          predictions: predictions,
          grainStatistics: distribution,
          coolingCorrelation: correlation,
          params: processParams,
          evaluation: evaluation,
          suggestions: suggestions
        });
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

app.get('/api/process/optimal', (req, res) => {
  const currentParams = {
    weldingSpeed: parseFloat(req.query.welding_speed) || 5,
    heatInput: parseFloat(req.query.heat_input) || 8
  };
  
  const optimal = optimizer.predictOptimalParams(currentParams);
  res.json({
    success: true,
    current: currentParams,
    recommended: optimal.recommended,
    expectedOutcome: optimal.expectedOutcome,
    explanation: optimal.explanation
  });
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`力学性能预测API: POST /api/predict/mechanical`);
  console.log(`工艺评估API: POST /api/process/evaluate`);
  console.log(`晶粒统计API: POST /api/statistics/grain-size`);
  console.log(`快照分析API: GET /api/snapshots/:id/analysis`);
});
