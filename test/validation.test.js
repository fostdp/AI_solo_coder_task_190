const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const frameworkCode = fs.readFileSync(path.join(__dirname, '../public/microstructure-framework.js'), 'utf8');
const context = { module: { exports: {} }, console };
vm.createContext(context);
vm.runInContext(frameworkCode, context);

const { PhaseFieldModel, NucleationModel, GrainSizeModel, CellularAutomatonModel, MicrostructureFramework } = context.module.exports;

const TEST_RESULTS = {
  passed: 0,
  failed: 0,
  failures: [],
  assertions: []
};

function logAssertion(testName, assertion, passed, actual = null, expected = null) {
  TEST_RESULTS.assertions.push({
    testName,
    assertion,
    passed,
    actual,
    expected
  });
  if (passed) {
    TEST_RESULTS.passed++;
    console.log(`  ✓ ${assertion}`);
  } else {
    TEST_RESULTS.failed++;
    TEST_RESULTS.failures.push({
      testName,
      assertion,
      actual,
      expected
    });
    console.log(`  ✗ ${assertion}`);
    if (actual !== null && expected !== null) {
      console.log(`    实际值: ${JSON.stringify(actual)}, 期望值: ${JSON.stringify(expected)}`);
    }
  }
}

class WeldSimulationTester {
  constructor() {
    this.gridResolution = 100;
    this.cellSize = 0.4;
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
  }

  calculateNucleationRate(coolingRate, tempGradMag) {
    return this.microstructure.getNucleationModel().calculateNucleationRate(coolingRate, tempGradMag);
  }

  predictGrainSizeFromCoolingRate(coolingRate) {
    return this.microstructure.getNucleationModel().predictGrainSizeFromCoolingRate(coolingRate);
  }

  calculatePoolSize(heatInput, weldingSpeed) {
    const efficiency = 0.8;
    const energyPerUnitLength = (heatInput * 1000 * efficiency) / weldingSpeed;
    const poolWidth = Math.sqrt(energyPerUnitLength) * 0.15;
    const poolDepth = Math.sqrt(energyPerUnitLength) * 0.08;
    const poolArea = poolWidth * poolDepth * Math.PI * 0.5;
    return { width: poolWidth, depth: poolDepth, area: poolArea };
  }

  calculateCoolingRate(weldingSpeed, heatInput) {
    const baseCooling = 50;
    const speedEffect = weldingSpeed * 15;
    const heatEffect = -heatInput * 3;
    return Math.max(10, baseCooling + speedEffect + heatEffect);
  }

  calculateTemperatureGradient(weldingSpeed, heatInput) {
    const baseGradient = 50;
    const speedEffect = -weldingSpeed * 4;
    const heatEffect = heatInput * 2;
    return Math.max(5, baseGradient + speedEffect + heatEffect);
  }

  getNucleationDependenceParams() {
    return this.microstructure.getNucleationModel().getCoolingRateDependenceParams();
  }
}

async function testGrainSizeVsWeldingSpeed() {
  console.log('\n' + '='.repeat(60));
  console.log('测试1: 焊接速度变化对晶粒尺寸的影响');
  console.log('='.repeat(60));

  const tester = new WeldSimulationTester();
  const heatInput = 8;
  const speeds = [5, 10, 15, 20];
  const results = [];

  for (const speed of speeds) {
    const coolingRate = tester.calculateCoolingRate(speed, heatInput);
    const tempGrad = tester.calculateTemperatureGradient(speed, heatInput);
    const nucleationRate = tester.calculateNucleationRate(coolingRate, tempGrad);
    const grainSize = tester.predictGrainSizeFromCoolingRate(coolingRate);

    results.push({
      speed,
      coolingRate,
      tempGrad,
      nucleationRate,
      grainSize
    });

    console.log(`\n  焊接速度: ${speed} mm/s`);
    console.log(`    冷却速率: ${coolingRate.toFixed(1)} °C/s`);
    console.log(`    温度梯度: ${tempGrad.toFixed(1)} °C/mm`);
    console.log(`    形核率: ${nucleationRate.toFixed(4)}`);
    console.log(`    预测晶粒尺寸: ${grainSize.toFixed(4)} μm`);
  }

  const assertions = [
    {
      name: '焊接速度5mm/s的晶粒尺寸应大于10mm/s的晶粒尺寸',
      check: () => results[0].grainSize > results[1].grainSize,
      actual: `${results[0].grainSize.toFixed(4)} mm`,
      expected: `> ${results[1].grainSize.toFixed(4)} mm`
    },
    {
      name: '焊接速度10mm/s的晶粒尺寸应大于15mm/s的晶粒尺寸',
      check: () => results[1].grainSize > results[2].grainSize,
      actual: `${results[1].grainSize.toFixed(4)} mm`,
      expected: `> ${results[2].grainSize.toFixed(4)} mm`
    },
    {
      name: '焊接速度15mm/s的晶粒尺寸应大于20mm/s的晶粒尺寸',
      check: () => results[2].grainSize > results[3].grainSize,
      actual: `${results[2].grainSize.toFixed(4)} mm`,
      expected: `> ${results[3].grainSize.toFixed(4)} mm`
    },
    {
      name: '冷却速率应随焊接速度增加而增加',
      check: () => results[0].coolingRate < results[3].coolingRate,
      actual: `${results[0].coolingRate.toFixed(1)} → ${results[3].coolingRate.toFixed(1)} °C/s`,
      expected: '递增'
    },
    {
      name: '形核率应随焊接速度增加而增加',
      check: () => results[0].nucleationRate < results[3].nucleationRate,
      actual: `${results[0].nucleationRate.toFixed(4)} → ${results[3].nucleationRate.toFixed(4)}`,
      expected: '递增'
    },
    {
      name: '晶粒尺寸总体减小幅度应大于20%',
      check: () => (results[0].grainSize - results[3].grainSize) / results[0].grainSize > 0.2,
      actual: `${(((results[0].grainSize - results[3].grainSize) / results[0].grainSize) * 100).toFixed(1)}%`,
      expected: '> 20%'
    }
  ];

  for (const assertion of assertions) {
    logAssertion('焊接速度-晶粒尺寸测试', assertion.name, assertion.check(), assertion.actual, assertion.expected);
  }

  return results;
}

async function testPoolSizeVsHeatInput() {
  console.log('\n' + '='.repeat(60));
  console.log('测试2: 热输入变化对熔池尺寸的影响');
  console.log('='.repeat(60));

  const tester = new WeldSimulationTester();
  const weldingSpeed = 10;
  const heatInputs = [5, 10, 15, 20];
  const results = [];

  for (const heatInput of heatInputs) {
    const poolSize = tester.calculatePoolSize(heatInput, weldingSpeed);
    results.push({
      heatInput,
      poolWidth: poolSize.width,
      poolDepth: poolSize.depth,
      poolArea: poolSize.area
    });

    console.log(`\n  热输入: ${heatInput} kJ/cm`);
    console.log(`    熔池宽度: ${poolSize.width.toFixed(2)} mm`);
    console.log(`    熔池深度: ${poolSize.depth.toFixed(2)} mm`);
    console.log(`    熔池面积: ${poolSize.area.toFixed(2)} mm²`);
  }

  const assertions = [
    {
      name: '热输入5kJ/cm的熔池面积应小于10kJ/cm的熔池面积',
      check: () => results[0].poolArea < results[1].poolArea,
      actual: `${results[0].poolArea.toFixed(2)} mm²`,
      expected: `< ${results[1].poolArea.toFixed(2)} mm²`
    },
    {
      name: '热输入10kJ/cm的熔池面积应小于15kJ/cm的熔池面积',
      check: () => results[1].poolArea < results[2].poolArea,
      actual: `${results[1].poolArea.toFixed(2)} mm²`,
      expected: `< ${results[2].poolArea.toFixed(2)} mm²`
    },
    {
      name: '热输入15kJ/cm的熔池面积应小于20kJ/cm的熔池面积',
      check: () => results[2].poolArea < results[3].poolArea,
      actual: `${results[2].poolArea.toFixed(2)} mm²`,
      expected: `< ${results[3].poolArea.toFixed(2)} mm²`
    },
    {
      name: '熔池宽度应随热输入增加而增加',
      check: () => results[0].poolWidth < results[3].poolWidth,
      actual: `${results[0].poolWidth.toFixed(2)} → ${results[3].poolWidth.toFixed(2)} mm`,
      expected: '递增'
    },
    {
      name: '熔池深度应随热输入增加而增加',
      check: () => results[0].poolDepth < results[3].poolDepth,
      actual: `${results[0].poolDepth.toFixed(2)} → ${results[3].poolDepth.toFixed(2)} mm`,
      expected: '递增'
    },
    {
      name: '熔池面积总体增加幅度应大于50%',
      check: () => (results[3].poolArea - results[0].poolArea) / results[0].poolArea > 0.5,
      actual: `${(((results[3].poolArea - results[0].poolArea) / results[0].poolArea) * 100).toFixed(1)}%`,
      expected: '> 50%'
    },
    {
      name: '熔池深宽比应保持相对稳定(0.4-0.6)',
      check: () => results.every(r => r.poolDepth / r.poolWidth >= 0.4 && r.poolDepth / r.poolWidth <= 0.6),
      actual: results.map(r => (r.poolDepth / r.poolWidth).toFixed(2)).join(', '),
      expected: '0.4 - 0.6'
    }
  ];

  for (const assertion of assertions) {
    logAssertion('热输入-熔池尺寸测试', assertion.name, assertion.check(), assertion.actual, assertion.expected);
  }

  return results;
}

async function testBackendDataStructure() {
  console.log('\n' + '='.repeat(60));
  console.log('测试3: 后端凝固数据结构验证');
  console.log('='.repeat(60));

  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 8088,
      path: '/api/snapshots',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const snapshots = JSON.parse(data);
          console.log(`\n  获取到 ${snapshots.length} 个快照记录`);

          if (snapshots.length === 0) {
            console.log('  警告: 暂无快照数据，请先运行模拟并保存快照');
            resolve([]);
            return;
          }

          const sample = snapshots[0];
          console.log(`\n  快照ID: ${sample.id}`);
          console.log('  字段检查:');

          const requiredFields = [
            { field: 'average_grain_size', label: '平均晶粒尺寸' },
            { field: 'grain_count', label: '晶粒数量' },
            { field: 'columnar_grain_ratio', label: '柱状晶比例' },
            { field: 'max_grain_size', label: '最大晶粒尺寸' },
            { field: 'min_grain_size', label: '最小晶粒尺寸' },
            { field: 'avg_cooling_rate', label: '平均冷却速率' },
            { field: 'solidification_rate', label: '凝固率' }
          ];

          const assertions = [];

          for (const fieldInfo of requiredFields) {
            const hasField = sample.hasOwnProperty(fieldInfo.field);
            const hasValue = sample[fieldInfo.field] !== null && sample[fieldInfo.field] !== undefined;
            const passed = hasField && hasValue;

            assertions.push({
              name: `快照应包含${fieldInfo.label}字段 (${fieldInfo.field})`,
              check: () => passed,
              actual: hasField ? (hasValue ? sample[fieldInfo.field] : 'null') : '不存在',
              expected: '存在且非null'
            });

            console.log(`    ${fieldInfo.label}: ${passed ? '✓' : '✗'} ${sample[fieldInfo.field]}`);
          }

          assertions.push({
            name: '平均晶粒尺寸应为正数',
            check: () => sample.average_grain_size > 0,
            actual: sample.average_grain_size,
            expected: '> 0'
          });

          assertions.push({
            name: '柱状晶比例应在0-1范围内',
            check: () => sample.columnar_grain_ratio >= 0 && sample.columnar_grain_ratio <= 1,
            actual: sample.columnar_grain_ratio,
            expected: '0 - 1'
          });

          assertions.push({
            name: '晶粒数量应为正整数',
            check: () => Number.isInteger(sample.grain_count) && sample.grain_count > 0,
            actual: sample.grain_count,
            expected: '正整数'
          });

          for (const assertion of assertions) {
            logAssertion('后端数据结构测试', assertion.name, assertion.check(), assertion.actual, assertion.expected);
          }

          resolve(snapshots);
        } catch (e) {
          console.log(`  解析错误: ${e.message}`);
          logAssertion('后端数据结构测试', 'API返回有效JSON', false, e.message, '有效JSON');
          resolve([]);
        }
      });
    });

    req.on('error', (e) => {
      console.log(`  请求错误: ${e.message}`);
      logAssertion('后端数据结构测试', 'API可访问', false, e.message, '连接成功');
      resolve([]);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      console.log('  请求超时');
      logAssertion('后端数据结构测试', 'API响应超时', false, '超时', '< 5s');
      resolve([]);
    });

    req.end();
  });
}

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('测试总结');
  console.log('='.repeat(60));
  console.log(`\n  总断言数: ${TEST_RESULTS.assertions.length}`);
  console.log(`  通过: ${TEST_RESULTS.passed}`);
  console.log(`  失败: ${TEST_RESULTS.failed}`);
  console.log(`  通过率: ${((TEST_RESULTS.passed / TEST_RESULTS.assertions.length) * 100).toFixed(1)}%`);

  if (TEST_RESULTS.failures.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('失败用例明细');
    console.log('='.repeat(60));
    TEST_RESULTS.failures.forEach((f, i) => {
      console.log(`\n  ${i + 1}. [${f.testName}]`);
      console.log(`     断言: ${f.assertion}`);
      if (f.actual !== null && f.expected !== null) {
        console.log(`     实际值: ${f.actual}`);
        console.log(`     期望值: ${f.expected}`);
      }
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('详细断言列表');
  console.log('='.repeat(60));
  TEST_RESULTS.assertions.forEach((a, i) => {
    const status = a.passed ? 'PASS' : 'FAIL';
    console.log(`\n  ${i + 1}. [${status}] [${a.testName}]`);
    console.log(`     ${a.assertion}`);
    if (!a.passed && a.actual !== null) {
      console.log(`     实际: ${a.actual}, 期望: ${a.expected}`);
    }
  });
}

async function runAllTests() {
  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(15) + '焊接熔池模拟系统验证测试' + ' '.repeat(15) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');

  await testGrainSizeVsWeldingSpeed();
  await testPoolSizeVsHeatInput();
  await testBackendDataStructure();

  printSummary();

  process.exit(TEST_RESULTS.failed > 0 ? 1 : 0);
}

runAllTests().catch(console.error);
