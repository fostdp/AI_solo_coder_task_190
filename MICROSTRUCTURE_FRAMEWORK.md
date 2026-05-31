# 微观组织框架重构说明

## 重构概述

本次重构将原本分散的凝固组织模型统一为模块化的微观组织框架，实现了：

1. **模块化架构** - 相场、元胞自动机、形核密度模型分离
2. **冷却速率关联** - 形核和晶粒尺寸计算与冷却速率强关联
3. **数据存储增强** - 每个晶粒关联平均冷却速率

---

## 架构设计

```
MicrostructureFramework
├── PhaseFieldModel          # 相场模型 - 固液相变
├── NucleationModel         # 形核模型 - 冷却速率关联
├── GrainSizeModel          # 晶粒尺寸模型 - 尺寸计算与存储
└── CellularAutomatonModel  # 元胞自动机 - 晶粒生长
```

---

## 核心模块说明

### 1. PhaseFieldModel (相场模型)

**位置**: `microstructure-framework.js:1-64

**核心功能:
- 基于温度场计算固液相变
- 相变动力学: T ≥ Tm → 液相 (phase=1)
- T ≤ Ts → 固相 (phase=0)
- Ts < T < Tm → 糊状区

**关键方法**:
- `update(temperatureField)` - 更新相场
- `isSolid(y, x)` - 判断是否为固相
- `isLiquid(y, x)` - 判断是否为液相
- `isSolidifying(y, x)` - 判断是否正在凝固

---

### 2. NucleationModel (形核模型)

**位置**: `microstructure-framework.js:66-164

**核心特性: 形核率与冷却速率关联

**形核率公式:
```
形核率 = 基础形核率 + 冷却速率效应 + 温度梯度效应

其中:
- 冷却速率效应 = (冷却速率/100)^0.7 × 0.5
- 温度梯度效应:
  - 低梯度区: +0.25
  - 高梯度区: +0.05
```

**关键方法**:
- `calculateNucleationRate(coolingRate, tempGradMag)` - 计算形核率
- `calculateNucleationDensity(coolingRate)` - 计算形核密度
- `predictGrainSizeFromCoolingRate(coolingRate)` - 预测晶粒尺寸
- `logNucleationEvent(...)` - 记录形核事件
- `getNucleationStats()` - 获取形核统计

**冷却速率依赖参数**:
```javascript
{
  baseNucleation: 0.0005,      // 基础形核率
  coolingRateCoeff: 0.5,             // 冷却速率系数
  coolingRateExponent: 0.7,           // 冷却速率指数
  lowGradientBoost: 0.25,             // 低梯度增强
  highGradientBoost: 0.05,            // 高梯度增强
  gradientThreshold: 15,               // 梯度阈值
  maxNucleationRate: 2.0              // 最大形核率
}
```

---

### 3. GrainSizeModel (晶粒尺寸模型)

**位置**: `microstructure-framework.js:166-289

**核心特性: 晶粒尺寸与冷却速率关联存储

**数据结构**:
```javascript
{
  grainId: {
    cellCount: number,           // 晶粒胞数
    totalCoolingRate: {
      total: number,              // 总冷却速率
      count: number,                // 统计次数
    }
  }
}
```

**关键方法**:
- `updateCellCount(grainId)` - 更新晶粒胞数
- `updateGrainCoolingRate(grainId, coolingRate)` - 更新晶粒冷却速率
- `getAverageCoolingRateForGrain(grainId)` - 获取晶粒平均冷却速率
- `getGrainSizeData(grainIdField)` - 获取晶粒尺寸数据（含冷却速率
- `getSizeDistribution(grainIdField)` - 获取尺寸分布

---

### 4. CellularAutomatonModel (元胞自动机模型)

**位置**: `microstructure-framework.js:291-491

**核心特性: 晶粒生长与形态控制

**区域类型判定**:
- **柱状晶区`: 温度梯度 > 30°C/mm
  - 生长概率 +30%
  - 取向变化 ±10°
- **等轴晶区`: 冷却速率 > 100°C/s 且 温度梯度 < 20°C/mm
  - 取向变化 ±60°
- **混合区**: 其他区域
  - 取向变化 ±30°

**关键方法**:
- `determineZoneType(coolingRate, tempGradMag)` - 判定区域类型
- `selectPreferredGrain(neighbors, tempGrad, isColumnarZone)` - 择优生长选择
- `update(...)` - 执行晶粒生长更新

---

### 5. MicrostructureFramework (统一框架)

**位置**: `microstructure-framework.js:493-721

**统一入口，协调各模块

**关键方法**:
- `update(temperatureField, prevTemperatureField)` - 统一更新入口
  1. 更新冷却速率场
  2. 更新温度梯度场
  3. 更新形核密度场
  4. 更新相场
  5. 更新元胞自动机
  6. 更新晶粒尺寸图

- `calculateQuantitativeMetallography()` - 计算定量金相数据
- `getCoolingRateStats()` - 获取冷却速率统计
- `exportMicrostructureData()` - 导出完整微观组织数据

---

## 数据导出结构

### 导出数据结构 (`exportMicrostructureData()`:

```javascript
{
  // 场数据:
  phaseField: number[][],              // 相场
  grainIdField: number[][],         // 晶粒ID场
  grainOrientationField: number[][],    // 晶粒取向场
  grainSizeMap: number[][],            // 晶粒尺寸图
  coolingRateField: number[][],           // 冷却速率场
  tempGradMagnitudeField: number[][],     // 温度梯度场
  nucleationDensityField: number[][], // 形核密度场

  // 定量金相:
  quantitativeMetallography: {
    averageGrainSize: number,
    grainCount: number,
    totalSolidifiedArea: number,
    grainSizeDistribution: Array,
    columnarGrainRatio: number,
    equiaxedGrainRatio: number,
    maxGrainSize: number,
    minGrainSize: number,
    nucleationEventCount: number,
    avgNucleationCoolingRate: number,
    grainSizesWithCoolingRate: Array  // 各晶粒尺寸+冷却速率
  },

  // 统计数据:
  coolingRateStats: {
    avg: number,
    max: number,
    min: number,
    count: number
  },
  nucleationStats: {
    totalEvents: number,
    avgCoolingRate: number,
    avgPredictedSize: number
  },
  grainSizeData: Array  // 详细晶粒尺寸数据
}
```

---

## 与主模拟类集成

### WeldPoolSimulation 中的使用

**位置**: `simulation.js:43-47, 208-211

```javascript
// 初始化:
this.microstructure = new MicrostructureFramework(
  this.gridResolution,
  this.materialProps,
  this.cellSize
);

// 每步更新:
this.microstructure.update(
  this.temperatureField,
  this.prevTemperatureField
);

// 获取数据:
const metalloData = this.microstructure.calculateQuantitativeMetallography();
const coolingStats = this.microstructure.getCoolingRateStats();
const nucleationStats = this.microstructure.getNucleationModel().getNucleationStats();
```

---

## 新增功能

### 1. 晶粒-冷却速率关联存储

每个晶粒都存储:
- 晶粒生长过程中累计冷却速率
- 可获取每个晶粒的平均冷却速率
- 可用于后续力学性能预测

### 2. 形核事件日志

记录每次形核事件:
- 位置 (x, y)
- 晶粒ID
- 形核时冷却速率
- 形核时温度梯度
- 形核率
- 预测晶粒尺寸

### 3. 增强的定量金相

新增数据:
- 形核事件总数
- 平均形核冷却速率
- 各晶粒尺寸+冷却速率数组

---

## 文件变更

### 新增文件:
- `public/microstructure-framework.js` - 微观组织框架

### 修改文件:
- `public/index.html` - 引入框架
- `public/simulation.js` - 集成框架

---

## 向后兼容性

✅ 保留原有API接口不变
✅ 保留原有渲染逻辑
✅ 保留原有数据存储格式
✅ 新增功能不破坏现有功能

---

## 使用示例

### 获取特定晶粒的平均冷却速率

```javascript
const grainSizeModel = microstructure.getGrainSizeModel();
const avgCR = grainSizeModel.getAverageCoolingRateForGrain(grainId);
```

### 获取形核统计

```javascript
const nucleationModel = microstructure.getNucleationModel();
const stats = nucleationModel.getNucleationStats();
console.log(`总形核事件: ${stats.totalEvents}`);
console.log(`平均形核冷却速率: ${stats.avgCoolingRate}`);
```

### 调整形核率参数

```javascript
const nucleationModel = microstructure.getNucleationModel();
nucleationModel.setCoolingRateDependenceParams({
  coolingRateCoeff: 0.6,
  maxNucleationRate: 2.5
});
```

---

## 测试验证

运行测试:
```bash
node test/validation.test.js
```

预期结果:
- 焊接速度增加 → 晶粒尺寸减小 ✅
- 热输入增加 → 熔池尺寸增大 ✅
- 后端数据包含平均晶粒尺寸 ✅
