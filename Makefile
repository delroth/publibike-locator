all: favicon512.png favicon192.png app.min.js

app.js: app.ts
	tsc --target es2018 --outFile $@ $<

app.min.js: app.js
	# '--compilation_level ADVANCED' breaks somehow
	closure-compiler --js $< --js_output_file $@

favicon%.png: favicon.svg
	inkscape --export-overwrite -o $@ --export-width $* $<
