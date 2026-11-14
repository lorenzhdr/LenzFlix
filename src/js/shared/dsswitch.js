// LenzFlix: Schalter-Zeile „Datensparmodus“ für alle Menüs (Popover, Sheets, flix „Mehr“, Handy-Overlay).
import { isDataSaverOn, setDataSaver, onDataSaverChange } from '../core/datasaver.js';
import { switchVisual, setSwitchState, bindSwitch, switchButton } from '../core/switch.js';

export { switchVisual, setSwitchState, bindSwitch, switchButton };

/** Item-Objekt für openPopover/Sheets/switchButton; watch hält den Zustand synchron, wenn z. B. das Symbol umschaltet. */
export const dataSaverItem = () => ({
  key: 'datasaver',
  label: 'Datensparmodus',
  switch: true,
  checked: isDataSaverOn(),
  onToggle: (next) => setDataSaver(next),
  watch: (cb) => onDataSaverChange(() => cb(isDataSaverOn())),
});
