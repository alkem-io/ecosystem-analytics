import { useState, useEffect } from 'react';
import styles from './LoadingScreen.module.css';

const STATUS_MESSAGES = [
  'Connecting to Alkemio…',
  'Fetching space data…',
  'Loading subspaces…',
  'Processing posts and responses…',
  'Analysing contributors…',
  'Computing metrics…',
  'Almost there…',
];

const MESSAGE_INTERVAL = 4000;

export default function LoadingScreen() {
  const [messageIdx, setMessageIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setMessageIdx((prev) => Math.min(prev + 1, STATUS_MESSAGES.length - 1));
    }, MESSAGE_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Asymptotic progress: approaches 95% but never reaches 100%
  const progress = Math.min(95, 100 * (1 - Math.exp(-elapsed / 20)));

  return (
    <div className={styles.container}>
      <div className={styles.spinner} />
      <div className={styles.status}>{STATUS_MESSAGES[messageIdx]}</div>
      <div className={styles.progressTrack}>
        <div className={styles.progressBar} style={{ width: `${progress}%` }} />
      </div>
      <div className={styles.hint}>
        {elapsed < 10
          ? 'Fetching live data from Alkemio'
          : 'Large spaces require multiple API calls — subsequent loads are instant from cache'}
      </div>
    </div>
  );
}
