import { send } from '@/background/messaging';
import { readLocal, writeLocal } from '@/shared/storage';
import { normalizeGpcException } from '@/shared/gpc';

const enabled = document.querySelector<HTMLInputElement>('#enabled');
const showCounter = document.querySelector<HTMLInputElement>('#showCounter');
const weeklyReportNotification = document.querySelector<HTMLInputElement>('#weekly-report-notification');
const clear = document.querySelector<HTMLButtonElement>('#clear');
const cleared = document.querySelector<HTMLParagraphElement>('#cleared');
const xrayWarning = document.querySelector<HTMLParagraphElement>('#xray-warning');
const gpcEnabled = document.querySelector<HTMLInputElement>('#gpc-enabled');
const exceptionInput = document.querySelector<HTMLInputElement>('#gpc-exception-input');
const exceptionAdd = document.querySelector<HTMLButtonElement>('#gpc-exception-add');
const exceptionList = document.querySelector<HTMLUListElement>('#gpc-exceptions');

void (async () => {
  if (
    enabled === null ||
    showCounter === null ||
    weeklyReportNotification === null ||
    gpcEnabled === null ||
    exceptionInput === null ||
    exceptionAdd === null ||
    exceptionList === null ||
    clear === null ||
    cleared === null
  ) return;

  const state = await readLocal();
  enabled.checked = state.settings.enabled;
  showCounter.checked = state.settings.showCounter;
  weeklyReportNotification.checked = state.settings.weeklyReportNotificationEnabled;
  gpcEnabled.checked = state.settings.gpcEnabled;
  renderExceptions(state.gpcExceptions);

  const persist = async () => {
    const current = await readLocal();
    await writeLocal({
      settings: {
        ...current.settings,
        enabled: enabled.checked,
        showCounter: showCounter.checked,
        weeklyReportNotificationEnabled: weeklyReportNotification.checked,
        gpcEnabled: gpcEnabled.checked,
      },
    });
  };

  enabled.addEventListener('change', () => void persist());
  showCounter.addEventListener('change', () => void persist());
  weeklyReportNotification.addEventListener('change', () => void persist());
  gpcEnabled.addEventListener('change', () => void persist());

  exceptionAdd.addEventListener('click', () => {
    const exception = normalizeGpcException(exceptionInput.value);
    if (exception === null) {
      exceptionInput.setCustomValidity('Enter a hostname such as example.com.');
      exceptionInput.reportValidity();
      return;
    }
    exceptionInput.setCustomValidity('');
    void (async () => {
      const current = await readLocal();
      const exceptions = current.gpcExceptions.includes(exception)
        ? current.gpcExceptions
        : [...current.gpcExceptions, exception].sort();
      await writeLocal({ gpcExceptions: exceptions });
      renderExceptions(exceptions);
      exceptionInput.value = '';
    })();
  });

  exceptionList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || target.dataset.exception === undefined) return;
    void (async () => {
      const current = await readLocal();
      const exceptions = current.gpcExceptions.filter((entry) => entry !== target.dataset.exception);
      await writeLocal({ gpcExceptions: exceptions });
      renderExceptions(exceptions);
    })();
  });

  if (xrayWarning !== null) {
    void chrome.commands.getAll().then((commands) => {
      const command = commands.find((entry) => entry.name === 'toggle-xray');
      xrayWarning.hidden = command !== undefined && command.shortcut !== '';
    });
  }

  clear.addEventListener('click', () => {
    void (async () => {
      await send({ type: 'CLEAR_ALL_DATA' });
      cleared.hidden = false;
    })();
  });
})();

function renderExceptions(exceptions: string[]): void {
  if (exceptionList === null) return;
  exceptionList.replaceChildren();
  for (const exception of exceptions) {
    const item = document.createElement('li');
    const hostname = document.createElement('span');
    hostname.textContent = exception;
    item.appendChild(hostname);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.dataset.exception = exception;
    item.appendChild(remove);
    exceptionList.appendChild(item);
  }
}
