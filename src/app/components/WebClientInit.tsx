'use client';

import ClientInit from './ClientInit';
import { createWebPlatformAdapter } from './platform';

export default function WebClientInit() {
  return <ClientInit adapter={createWebPlatformAdapter()} />;
}
