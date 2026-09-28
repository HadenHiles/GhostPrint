import { send } from '@/background/messaging';

const status = document.querySelector<HTMLParagraphElement>('#status');

void (async () => {
  if (status === null) return;
  try {
    const pong = await send({ type: 'PING' });
    status.textContent = `Service worker alive (${new Date(pong.at).toLocaleTimeString()})`;
    status.dataset.ghostprintReady = String(pong.at);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Unavailable';
  }
})();
