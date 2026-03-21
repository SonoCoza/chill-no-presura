export const CustomToggle = ({ checked, onChange, label }) => (
  <label className="custom-toggle">
    <input type="checkbox" checked={checked} onChange={onChange} style={{ display: 'none' }} />
    <span className={`custom-toggle__track ${checked ? 'on' : ''}`}>
      <span className="custom-toggle__thumb" />
    </span>
    {label && <span className="custom-toggle__label">{label}</span>}
  </label>
);

export default CustomToggle;
