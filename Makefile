.PHONY: install build serve clean

install:
	bundle install

build:
	JEKYLL_ENV=production bundle exec jekyll build --strict_front_matter

serve:
	bundle exec jekyll serve --host 127.0.0.1 --port 4000

clean:
	rm -rf _site .jekyll-cache .jekyll-metadata
