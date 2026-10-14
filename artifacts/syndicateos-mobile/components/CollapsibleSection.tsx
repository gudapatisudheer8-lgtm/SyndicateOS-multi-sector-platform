import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

/**
 * Collapsed by default. Body mounts lazily on first open and then stays mounted
 * (display none while hidden) so drafts, acknowledgements and leave guards survive.
 */
export function CollapsibleSection({ title, sub, testID, children }: { title: string; sub?: string; testID?: string; children: React.ReactNode }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const toggle = () => { setMounted(true); setOpen((o) => !o); };
  return (
    <View style={{ marginBottom: 10 }}>
      <Pressable
        testID={testID}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${open ? 'Hide' : 'Show'} ${title}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: open ? '#fcd34d' : c.border, backgroundColor: open ? '#FFFDF0' : c.card }}
      >
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 }}>{title}</Text>
          {sub ? <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 11 }}>{sub}</Text> : null}
        </View>
        <Text style={{ color: c.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{open ? 'Hide' : 'Show'}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.foreground} />
      </Pressable>
      {mounted ? (
        <View
          style={{ display: open ? 'flex' : 'none', marginTop: 8 }}
          pointerEvents={open ? 'auto' : 'none'}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
          aria-hidden={!open}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}
