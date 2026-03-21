export const CustomCheckbox = ({ checked, onChange, label, disabled }) => (
  <label className={`custom-checkbox ${disabled ? 'disabled' : ''}`}>
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      style={{ display: 'none' }}
    />
    <span className={`custom-checkbox__box ${checked ? 'checked' : ''}`}>
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="#0d0d0f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </span>
    {label && <span className="custom-checkbox__label">{label}</span>}
  </label>
);

export default CustomCheckbox;
