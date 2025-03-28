all: favicon512.png favicon192.png compile

.PHONY: compile
compile:
	yarn run build

favicon%.png: favicon.svg
	inkscape --export-overwrite -o $@ --export-width $* $<
