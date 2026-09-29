import { send } from '@/background/messaging';
import { readLocal, writeLocal } from '@/shared/storage';

const enabled = document.querySelector<HTMLInputElement>('#enabled');
const showCounter = document.querySelector<HTMLInputElement>('#showCounter');
const clear = document.querySelector<HTMLButtonElement>('#clear');
const cleared = document.querySelector<HTMLParagraphElement>('#cleared');

void (async () => {
  if (enabled === null || showCounter === null || clear === null || cleared === null) return;

  const state = await readLocal();
  enabled.checked = state.settings.enabled;
  showCounter.checked = state.settings.showCounter;

  const persist = async () => {
    const current = await readLocal();
    await writeLocal({
      settings: {
        ...current.settings,
        enabled: enabled.checked,
        showCounter: showCounter.checked,
      },
    });
  };

  enabled.addEventListener('change', () => void persist());
  showCounter.addEventListener('change', () => void persist());

  clear.addEventListener('click', () => {
    void (async () => {
      await send({ type: 'CLEAR_ALL_DATA' });
      cleared.hidden = false;
    })();
  });
})();
