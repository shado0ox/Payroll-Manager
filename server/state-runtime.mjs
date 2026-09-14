import { createStateEventBus } from './state-event-bus.mjs';
import { createStateVersionService } from './state-version-service.mjs';

export function createStateRuntime(dependencies) {
  return {
    ...createStateEventBus(dependencies),
    ...createStateVersionService(dependencies),
  };
}
