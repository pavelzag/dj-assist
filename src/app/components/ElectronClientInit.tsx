'use client';

import ClientInit from './ClientInit';
import { createElectronPlatformAdapter } from './platform';

export default function ElectronClientInit() {
  return <ClientInit adapter={createElectronPlatformAdapter()} />;
}
