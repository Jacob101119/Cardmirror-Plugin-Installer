# Two-tone icon alternates (saved, not in use)

Simple white + lighter-gray glyphs on neutral gray/black tiles, made as
alternates for Themes, Round Dashboard, Shrink Cites and Ribbon Manager.
Reverted on 2026-11-21; kept here so they can be put back without redrawing.

To use one again: paste its icon entry into the `ICONS` object in `plugin.js`,
then set that plugin's `accent`, `iconColor` and `icon` in `LOCAL_CATALOG` to
the values shown.

## Icon definitions (add to the ICONS object)

```js
// Themes: appearance — a circle with one half shaded (light/dark).
'theme-min': '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" opacity=".4"/>',
// Round Dashboard: a minimal gauge — a shaded arc with a white needle.
'dash-min': '<path d="M4 16a8 8 0 0 1 16 0" opacity=".4"/><path d="M12 16l5-4"/><circle cx="12" cy="16" r="1.6" fill="currentColor" stroke="none"/>',
// Shrink Cites: two chevrons closing toward a shaded middle line.
'shrink-min': '<path d="M4 12h16" opacity=".4"/><path d="M8 6l4 4 4-4"/><path d="M8 18l4-4 4 4"/>',
// Ribbon Manager: a toolbar with two buttons on and one off (shaded).
'ribbon-min': '<rect x="3" y="8" width="18" height="8" rx="2"/><circle cx="8" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" opacity=".4"/><circle cx="16" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
```

## Catalog settings for each

| Plugin          | accent                       | iconColor | icon          |
|-----------------|------------------------------|-----------|---------------|
| themes          | ['#52525b', '#27272a']       | #ffffff   | 'theme-min'   |
| round-dashboard | ['#3f3f46', '#18181b']       | #ffffff   | 'dash-min'    |
| shrink-cites    | ['#71717a', '#3f3f46']       | #ffffff   | 'shrink-min'  |
| ribbon-manager  | ['#27272a', '#09090b']       | #ffffff   | 'ribbon-min'  |
