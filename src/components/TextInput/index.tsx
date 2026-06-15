import { ChangeEventHandler, InputHTMLAttributes, KeyboardEventHandler } from 'react';
import styles from './TextInput.module.scss';

interface TextInputProps extends Pick<InputHTMLAttributes<HTMLInputElement>, 'placeholder' | 'maxLength' | 'autoComplete'> {
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  large?: boolean;
}

function TextInput({ value, onChange, onKeyDown, placeholder, maxLength, autoComplete, large }: TextInputProps) {
  return (
    <div className={`${styles['input-wrapper']} ${large ? styles.large : ''}`.trim()}>
      <input
        type="text"
        className={styles['text-input']}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
      />
    </div>
  );
}

export default TextInput;
