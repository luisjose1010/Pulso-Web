import {MobileInstallNotice} from './MobileInstallNotice';
import {AccountAccess} from './AccountAccess';
import './account-required.css';
export function AccountRequired(){return <main className="account-required"><MobileInstallNotice/><p className="pulso-wordmark" aria-label="Pulso">pulso</p><h1>Tu música empieza aquí</h1><p>Inicia sesión o crea tu cuenta para usar Pulso.</p><AccountAccess required/></main>;}
