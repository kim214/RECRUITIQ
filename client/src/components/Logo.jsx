import { Link } from 'react-router-dom';

export default function Logo({ variant = 'light', className = 'h-10' }) {
  const src = variant === 'dark' ? '/recruitiq-logo-dark.png' : '/recruitiq-logo-light.png';
  return (
    <Link to="/" className="inline-flex items-center" aria-label="RecruitIQ home">
      <img src={src} alt="RecruitIQ" className={`${className} w-auto object-contain`} />
    </Link>
  );
}
