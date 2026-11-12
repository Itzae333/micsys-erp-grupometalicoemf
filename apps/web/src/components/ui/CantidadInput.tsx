'use client';

import { useEffect, useState } from 'react';

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onChange: (n: number) => void;
}

// Input numérico que deja borrar el campo mientras se escribe (un <input
// type="number"> ligado directo a un número vuelve a poner "0" al vaciarlo).
// Hacia afuera siempre entrega un número (vacío = 0); al salir del campo
// vuelve a mostrar el valor real.
export function CantidadInput({ value, onChange, onBlur, ...rest }: Props) {
  const [texto, setTexto] = useState(String(value));

  // Si el valor cambia desde afuera (no por lo que se está escribiendo), se resincroniza.
  useEffect(() => {
    setTexto((t) => (Number(t) === value && t !== '' ? t : String(value)));
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      value={texto}
      onFocus={(e) => { e.target.select(); rest.onFocus?.(e); }}
      onChange={(e) => {
        setTexto(e.target.value);
        onChange(e.target.value === '' ? 0 : Number(e.target.value));
      }}
      onBlur={(e) => { setTexto(String(value)); onBlur?.(e); }}
    />
  );
}
