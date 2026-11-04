import { useEffect, useRef, useState } from 'react';

function segundosHasta(expiraEn: string): number {
  return Math.max(0, Math.ceil((new Date(expiraEn).getTime() - Date.now()) / 1000));
}

/** Segundos que faltan para `expiraEn` (ISO 8601). Se actualiza cada segundo y avisa una vez al llegar a 0. */
export function useCuentaRegresiva(expiraEn: string, onVencida?: () => void): number {
  const [segundos, setSegundos] = useState(() => segundosHasta(expiraEn));
  const alVencer = useRef(onVencida);
  useEffect(() => {
    alVencer.current = onVencida;
  });

  useEffect(() => {
    const id = setInterval(() => {
      const faltan = segundosHasta(expiraEn);
      setSegundos(faltan);
      if (faltan === 0) {
        clearInterval(id);
        alVencer.current?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiraEn]);

  return segundos;
}
