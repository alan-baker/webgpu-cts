/* eslint-disable prettier/prettier */
export const description = `
Test blending results.

TODO:
- Test result for all combinations of args (make sure each case is distinguishable from others
- Test underflow/overflow has consistent behavior
- ?
`;

import { params, poptions } from '../../../../common/framework/params_builder.js';
import { makeTestGroup } from '../../../../common/framework/test_group.js';
import { assert } from '../../../../common/framework/util/util.js';
import { GPUTest } from '../../../gpu_test.js';

export const g = makeTestGroup(GPUTest);

const kBlendFactors: GPUBlendFactor[] = [
  'zero',
  'one',
  'src-color',
  'one-minus-src-color',
  'src-alpha',
  'one-minus-src-alpha',
  'dst-color',
  'one-minus-dst-color',
  'dst-alpha',
  'one-minus-dst-alpha',
  'src-alpha-saturated',
  'blend-color',
  'one-minus-blend-color',
];

const kBlendOperations: GPUBlendOperation[] = [
  'add', //
  'subtract',
  'reverse-subtract',
  'min',
  'max',
];

function mapColor(
  col: GPUColorDict,
  f: (v: number, k: keyof GPUColorDict) => number
): GPUColorDict {
  return {
    r: f(col.r, 'r'),
    g: f(col.g, 'g'),
    b: f(col.b, 'b'),
    a: f(col.a, 'a'),
  };
}

function computeBlendFactor(
  src: GPUColorDict,
  dst: GPUColorDict,
  blendColor: GPUColorDict | undefined,
  factor: GPUBlendFactor
): GPUColorDict {
  switch (factor) {
    case 'zero':
      return { r: 0, g: 0, b: 0, a: 0 };
    case 'one':
      return { r: 1, g: 1, b: 1, a: 1 };
    case 'src':
    case 'src-color':
      return { ...src };
    case 'one-minus-src':
    case 'one-minus-src-color':
      return mapColor(src, v => 1 - v);
    case 'src-alpha':
      return mapColor(src, () => src.a);
    case 'one-minus-src-alpha':
      return mapColor(src, () => 1 - src.a);
    case 'dst':
    case 'dst-color':
      return { ...dst };
    case 'one-minus-dst':
    case 'one-minus-dst-color':
      return mapColor(dst, v => 1 - v);
    case 'dst-alpha':
      return mapColor(dst, () => dst.a);
    case 'one-minus-dst-alpha':
      return mapColor(dst, () => 1 - dst.a);
    case 'src-alpha-saturated': {
      const f = Math.min(src.a, 1 - dst.a);
      return { r: f, g: f, b: f, a: 1 };
    }
    case 'constant':
    case 'blend-color':
      assert(blendColor !== undefined);
      return { ...blendColor };
    case 'one-minus-constant':
    case 'one-minus-blend-color':
      assert(blendColor !== undefined);
      return mapColor(blendColor, v => 1 - v);
  }
}

function computeBlendOperation(src: GPUColorDict, srcFactor: GPUColorDict,
  dst: GPUColorDict, dstFactor: GPUColorDict, operation: GPUBlendOperation) {
  switch (operation) {
    case 'add':
      return mapColor(src, (_, k) => srcFactor[k] * src[k] + dstFactor[k] * dst[k]);
    case 'max':
      return mapColor(src, (_, k) => Math.max(src[k], dst[k]));
    case 'min':
      return mapColor(src, (_, k) => Math.min(src[k], dst[k]));
    case 'reverse-subtract':
      return mapColor(src, (_, k) => dstFactor[k] * dst[k] - srcFactor[k] * src[k]);
    case 'subtract':
      return mapColor(src, (_, k) => srcFactor[k] * src[k] - dstFactor[k] * dst[k]);
  }
}

g.test('GPUBlendComponent')
  .desc(
    `Test all combinations of parameters for GPUBlendComponent.

  Tests that parameters are correctly passed to the backend API and blend computations
  are done correctly by blending a single pixel. The test uses rgba32float as the format
  to avoid checking clamping behavior (tested in api,operation,rendering,blending:clamp,*).

  Params:
    - component= {color, alpha} - whether to test blending the color or the alpha component.
    - srcFactor= {...all GPUBlendFactors}
    - dstFactor= {...all GPUBlendFactors}
    - operation= {...all GPUBlendOperations}
  `)
  .cases(
    params() //
      .combine(poptions('component', ['color', 'alpha'] as const))
      .combine(poptions('srcFactor', kBlendFactors))
      .combine(poptions('dstFactor', kBlendFactors))
      .combine(poptions('operation', kBlendOperations))
  )
  .subcases((p) => {
    const needsBlendColor = (
      p.srcFactor === 'one-minus-blend-color' || p.srcFactor === 'blend-color' ||
      p.dstFactor === 'one-minus-blend-color' || p.dstFactor === 'blend-color'
    );

    return params()
      .combine(poptions('srcColor', [
        { r: 0.11, g: 0.61, b: 0.81, a: 0.44 }
      ]))
      .combine(poptions('dstColor', [
        { r: 0.51, g: 0.22, b: 0.71, a: 0.33 },
        { r: 0.09, g: 0.73, b: 0.93, a: 0.81 }
      ]))
      .combine(poptions('blendColor', needsBlendColor ? [
        { r: 0.91, g: 0.82, b: 0.73, a: 0.64 },
      ] : [ undefined ]));
  })
  .fn(t => {
    const textureFormat: GPUTextureFormat = 'rgba32float';
    const srcColor = t.params.srcColor;
    const dstColor = t.params.dstColor;
    const blendColor = t.params.blendColor;

    const srcFactor = computeBlendFactor(srcColor, dstColor, blendColor, t.params.srcFactor);
    const dstFactor = computeBlendFactor(srcColor, dstColor, blendColor, t.params.dstFactor);

    const expectedColor = computeBlendOperation(srcColor, srcFactor, dstColor, dstFactor, t.params.operation);

    switch (t.params.component) {
      case 'color':
        expectedColor.a = srcColor.a;
        break;
      case 'alpha':
        expectedColor.r = srcColor.r;
        expectedColor.g = srcColor.g;
        expectedColor.b = srcColor.b;
        break;
    }

    const pipeline = t.device.createRenderPipeline({
      fragment: {
        targets: [
          {
            format: textureFormat,
            blend: {
              // Set both color/alpha to defaults...
              color: {},
              alpha: {},
              // ... but then override the component we're testing.
              [t.params.component]: {
                srcFactor: t.params.srcFactor,
                dstFactor: t.params.dstFactor,
                operation: t.params.operation,
              },
            },
          },
        ],
        module: t.device.createShaderModule({
          code: `
[[block]] struct Uniform {
  color: vec4<f32>;
};
[[group(0), binding(0)]] var<uniform> u : Uniform;

[[location(0)]] var<out> output : vec4<f32>;
[[stage(fragment)]] fn main() -> void {
  output = u.color;
}
          `,
        }),
        entryPoint: 'main',
      },
      vertex: {
        module: t.device.createShaderModule({
          code: `
[[builtin(position)]] var<out> Position : vec4<f32>;
[[stage(vertex)]] fn main() -> void {
    Position = vec4<f32>(0.0, 0.0, 0.0, 1.0);
}
          `,
        }),
        entryPoint: 'main',
      },
      primitive: {
        topology: 'point-list',
      },
    });

    const renderTarget = t.device.createTexture({
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      size: [1, 1, 1],
      format: textureFormat,
    });

    const commandEncoder = t.device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          attachment: renderTarget.createView(),
          loadValue: dstColor,
        },
      ],
    });
    renderPass.setPipeline(pipeline);
    if (blendColor) {
      /* eslint-disable-next-line deprecation/deprecation */
      renderPass.setBlendColor(blendColor);
    }
    renderPass.setBindGroup(
      0,
      t.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: t.makeBufferWithContents(
                new Float32Array([srcColor.r, srcColor.g, srcColor.b, srcColor.a]),
                GPUBufferUsage.UNIFORM
              ),
            },
          },
        ],
      })
    );
    renderPass.draw(1);
    renderPass.endPass();

    t.device.queue.submit([commandEncoder.finish()]);

    const tolerance = 0.0001;
    const expectedLow = mapColor(expectedColor, v => v - tolerance);
    const expectedHigh = mapColor(expectedColor, v => v + tolerance);

    t.expectSinglePixelBetweenTwoValuesIn2DTexture(renderTarget, textureFormat, { x: 0, y: 0}, {
      exp: [
        new Float32Array([expectedLow.r, expectedLow.g, expectedLow.b, expectedLow.a]),
        new Float32Array([expectedHigh.r, expectedHigh.g, expectedHigh.b, expectedHigh.a]),
      ]
    });
  });

g.test('formats')
  .desc(
    `Test blending results works for all formats that support it, and that blending is not applied
  for formats that do not. Blending should be done in linear space for srgb formats.`)
  .unimplemented();

g.test('multiple_color_attachments')
  .desc('Test that if there are multiple color attachments, "src-color" refers to attachment index 0.')
  .unimplemented();

g.test('clamp,blend_factor')
  .desc('For fixed-point formats, test that the blend factor is clamped in the blend equation.')
  .unimplemented();

g.test('clamp,blend_color')
  .desc('For fixed-point formats, test that the blend color is clamped in the blend equation.')
  .unimplemented();

g.test('clamp,blend_result')
  .desc('For fixed-point formats, test that the blend result is clamped in the blend equation.')
  .unimplemented();
