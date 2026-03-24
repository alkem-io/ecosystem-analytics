import { useState, useRef, useEffect, type ReactNode } from 'react';
import styles from './InfoTooltip.module.css';

interface InfoTooltipProps {
  text: string;
  children: ReactNode;
}

export default function InfoTooltip({ text, children }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<'below' | 'above'>('below');
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!visible || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setPosition(rect.bottom + 120 > window.innerHeight ? 'above' : 'below');
  }, [visible]);

  return (
    <span
      ref={wrapperRef}
      className={styles.wrapper}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span className={`${styles.tooltip} ${styles[position]}`}>
          {text}
        </span>
      )}
    </span>
  );
}
