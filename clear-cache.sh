#!/bin/bash

echo "🧹 Clearing all development caches..."

# Clear browser cache instruction
echo "📱 Browser Cache:"
echo "   1. Open DevTools (F12)"
echo "   2. Right-click refresh button → 'Empty Cache and Hard Reload'"
echo "   3. Or use Cmd+Shift+R (Mac) / Ctrl+Shift+R (PC)"
echo ""

# Clear node modules cache
echo "📦 Node.js Cache:"
if [ -d "node_modules/.cache" ]; then
    rm -rf node_modules/.cache
    echo "   ✅ Cleared node_modules/.cache"
else
    echo "   ℹ️  No node_modules/.cache found"
fi

# Clear Vite cache
echo "🏗️  Vite Cache:"
if [ -d "node_modules/.vite" ]; then
    rm -rf node_modules/.vite
    echo "   ✅ Cleared node_modules/.vite"
else
    echo "   ℹ️  No Vite cache found"
fi

# Clear any potential Sharp cache
echo "🖼️  Sharp Cache:"
# Sharp typically doesn't create persistent cache files, but check common locations
CACHE_DIRS=(
    "node_modules/.cache/sharp"
    ".cache"
    "tmp"
    ".tmp"
)

for dir in "${CACHE_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        rm -rf "$dir"
        echo "   ✅ Cleared $dir"
    fi
done

echo "   ℹ️  Sharp processes images on-demand (no persistent cache)"

echo ""
echo "🔄 Restart your dev server:"
echo "   npm run dev"
echo ""
echo "✨ Cache clearing complete!"