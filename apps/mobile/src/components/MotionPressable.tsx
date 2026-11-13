import { useState, type ComponentProps, type ReactNode } from "react";
import { Pressable, type PressableProps, type PressableStateCallbackType } from "react-native";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type MotionPressableProps = PressableProps & {
  children: ReactNode;
  pressedScale?: number;
  entering?: ComponentProps<typeof AnimatedPressable>["entering"];
};

export function MotionPressable({ children, pressedScale = 0.97, style, onPressIn, onPressOut, ...props }: MotionPressableProps) {
  const [isPressed, setIsPressed] = useState(false);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(isPressed ? pressedScale : 1, {
          damping: isPressed ? 18 : 16,
          stiffness: isPressed ? 260 : 220,
          mass: isPressed ? 0.65 : 0.7,
        }),
      },
    ],
  }), [isPressed, pressedScale]);
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        setIsPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setIsPressed(false);
        onPressOut?.(event);
      }}
      // Reanimated no acepta `style` como función en un componente animado: en la web
      // descartaba todos los estilos (botones sin fondo, filas en columna). Se resuelve aquí
      // con el estado de presión que ya se lleva, y se pasa un arreglo normal.
      style={[
        typeof style === "function" ? style({ pressed: isPressed, hovered: false } as PressableStateCallbackType) : style,
        animatedStyle,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}
