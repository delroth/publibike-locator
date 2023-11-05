all: favicon512.png favicon192.png app.js

app.js: app.ts
	tsc --target es2018 --outFile $@ $<

favicon%.png: favicon.svg
	inkscape --export-overwrite -o $@ --export-width $* $<
