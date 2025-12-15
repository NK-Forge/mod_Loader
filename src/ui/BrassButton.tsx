import React from "react";
import { brassButtonBase, brassButtonActive } from "./theme";

export function BrassButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { children, style, ...rest } = props;
  const [pressed, setPressed] = React.useState(false);

  const mergedStyle = pressed
    ? { ...brassButtonBase, ...brassButtonActive, ...style }
    : { ...brassButtonBase, ...style };

  return (
    <button
      {...rest}
      style={mergedStyle}
      onMouseDown={(e) => {
        setPressed(true);
        rest.onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        setPressed(false);
        rest.onMouseUp?.(e);
      }}
      onMouseLeave={(e) => {
        setPressed(false);
        rest.onMouseLeave?.(e);
      }}
    >
      {children}
    </button>
  );
}
