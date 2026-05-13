"use client";

type Option = {
  label: string;
  value: string;
};

export function Segmented({
  name,
  value,
  options,
  onChange
}: {
  name: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      <input name={name} type="hidden" value={value} />
      {options.map((option) => (
        <button
          className="segment"
          data-active={value === option.value}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Score({
  name,
  value,
  onChange,
  max = 4,
  optional = false
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  max?: 3 | 4 | 7;
  optional?: boolean;
}) {
  const options = Array.from({ length: max + 1 }, (_, index) => String(index));
  if (max === 7) {
    options.shift();
  }
  return (
    <Segmented
      name={name}
      onChange={onChange}
      options={[...(optional ? [{ label: "未记录", value: "" }] : []), ...options.map((value) => ({ label: value, value }))]}
      value={value}
    />
  );
}

export function TriState({
  name,
  value,
  onChange
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Segmented
      name={name}
      onChange={onChange}
      options={[
        { label: "未确认", value: "" },
        { label: "是", value: "true" },
        { label: "否", value: "false" }
      ]}
      value={value}
    />
  );
}
