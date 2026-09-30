import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Chevron, Phone } from './Icons';
import { RollingText } from './RollingText';

type Variant = 'orange' | 'dark' | 'ghost' | 'outline';

interface Common {
  label: string;
  variant?: Variant;
  glow?: boolean;
  chevron?: boolean;
  block?: boolean;
  small?: boolean;
  className?: string;
  icon?: ReactNode;
}

function cls(c: Common) {
  return [
    'btn',
    'roll-host',
    `btn--${c.variant ?? 'orange'}`,
    c.glow ? 'btn--glow' : '',
    c.block ? 'btn--block' : '',
    c.small ? 'btn--sm' : '',
    c.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

function Inner(c: Common) {
  return (
    <>
      {c.icon}
      <RollingText text={c.label} />
      {c.chevron !== false && <Chevron />}
    </>
  );
}

export function ButtonLink(props: Common & { to: string }) {
  if (/^(https?:|tel:|mailto:)/.test(props.to)) {
    return (
      <a href={props.to} className={cls(props)} target={props.to.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
        <Inner {...props} />
      </a>
    );
  }
  return (
    <Link to={props.to} className={cls(props)}>
      <Inner {...props} />
    </Link>
  );
}

export function Button(
  props: Common & { onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; ariaLabel?: string },
) {
  return (
    <button type={props.type ?? 'button'} className={cls(props)} onClick={props.onClick} disabled={props.disabled} aria-label={props.ariaLabel}>
      <Inner {...props} />
    </button>
  );
}

/** Orange phone button with the white icon tile (hero / process). */
export function PhoneButton({ phone, glow }: { phone: string; glow?: boolean }) {
  return (
    <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={`btn btn--orange btn--phone roll-host ${glow ? 'btn--glow' : ''}`}>
      <span className="phone-icon">
        <Phone size={18} />
      </span>
      <RollingText text={phone} />
    </a>
  );
}
