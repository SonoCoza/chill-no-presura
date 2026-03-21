export const CustomRadio = ({ options, value, onChange, name }) => (
  <div className="custom-radio-group">
    {options.map(opt => (
      <label key={opt.value} className={`custom-radio ${value === opt.value ? 'selected' : ''}`}>
        <input
          type="radio"
          name={name}
          value={opt.value}
          checked={value === opt.value}
          onChange={() => onChange(opt.value)}
          style={{ display: 'none' }}
        />
        <span className="custom-radio__dot" />
        <span className="custom-radio__label">{opt.label}</span>
      </label>
    ))}
  </div>
);

export default CustomRadio;
