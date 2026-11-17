import {createRoot} from 'react-dom/client';
import {MobileInstallNotice} from '../../src/ui/MobileInstallNotice';
import '../../src/style.css';import '../../src/ui/shell.css';import '../../src/ui/design-tokens.css';import '../../src/ui/responsive-shell.css';import '../../src/ui/app-polish.css';
createRoot(document.getElementById('root')!).render(<main className="pulso-app"><MobileInstallNotice/><h1>Pulso de prueba</h1><p>Biblioteca sintética, sin música.</p></main>);
