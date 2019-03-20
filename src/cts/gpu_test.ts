import { getGPU } from "../framework/gpu/implementation.js";
import {
  GPUBuffer,
  GPUDevice,
  GPUQueue,
} from "../framework/gpu/interface.js";
import { CaseRecorder, Fixture, IParamsAny } from "../framework/index.js";

export class GPUTest extends Fixture {

  // TODO: Need to get rid of this so test fixtures can be created more easily.
  public static async create(log: CaseRecorder, params: IParamsAny) {
    const gpu = await getGPU();
    const adapter = await gpu.requestAdapter();
    const device = adapter.createDevice({}); // TODO: await adapter.requestDevice()
    return new GPUTest(log, params, device);
  }
  //public device: GPUDevice;
  public device: any; // TODO: update framework/gpu to match sketch again
  public queue: GPUQueue;

  protected constructor(log: CaseRecorder, params: IParamsAny, device: GPUDevice) {
    super(log, params);
    this.device = device;
    this.queue = this.device.getQueue();
  }

  public async expectContents(src: GPUBuffer, expected: Uint8Array): Promise<void> {
    const size = expected.length;
    const dst = this.device.createBuffer({
      size: expected.length,
      usage: 1 | 8,
    });

    const c = this.device.createCommandEncoder({});
    c.copyBufferToBuffer(src, 0, dst, 0, size);

    this.queue.submit([c.finish()]);

    const ab = await dst.mapReadAsync();
    const actual = new Uint8Array(ab);
    for (let i = 0; i < size; ++i) {
      if (actual[i] !== expected[i]) {
        this.rec.fail(`at [${i}], expected ${expected[i]}, got ${actual[i]}`);
        // TODO: limit number of fail logs for one expectContents?
      }
    }
    // TODO: log the actual and expected data
  }
}
