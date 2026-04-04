import AppShell from './components/AppShell';
import WebClientInit from './components/WebClientInit';

export default function Page() {
  return <AppShell platform="web" clientInit={<WebClientInit />} />;
}
