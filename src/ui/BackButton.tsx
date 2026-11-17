import type {ButtonHTMLAttributes,ReactNode} from 'react';
import './back-button.css';

/** A shared navigation affordance; the caller keeps its existing navigation guard. */
export function BackButton({children,className='',type='button',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{children:ReactNode}){
 return <button {...props} type={type} className={`back-button ${className}`.trim()}><span className="back-button__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="m14 6-6 6 6 6"/></svg></span><span className="back-button__label">{children}</span></button>;
}
