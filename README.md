Nitinol Design Concepts
================================

**Welcome SMST 2017 attendees!** _You can find Confluent presentations from the conference at the [nitinol.com](http://nitinol.com) reference library._

This project includes tutorials and examples related to design and simulation of superelastic nitinol components. This content is provided by [Confluent Medical Technologies](http://confluentmedical.com) as a resource for our customers, industry and community. If you want to know more about the background, or how you can contribute, read [about this project](about.md).

The material here includes a deeper dive into topics covered in our Nitinol University courses, as well as research supporting scientific presentations and publications. The [Design Tutorial](#design-tutorial) series provides an introduction to design and simulation of a nitinol component, following methods that are commonly applied in the medical device industry. The [SMST-17 Volumetric Methods](#smst-17-volumetric-methods) series ventures into more advanced topics related to volumetric and probabilistic methods for assessing fatigue durability, first presented in May 2017 at the [SMST](http://www.asminternational.org/web/smst2017) conference. 

## Design Tools

The [Nitinol Design Tools](300-nitinol-design-tools) page collects browser-based calculators for early nitinol medical device design work. The first tools include Abaqus Matprops for fitting superelastic-plastic material properties from tensile data and Open Stent Calculator for screening open-cell stent concepts.

## Local Jekyll Preview

This site is built with GitHub Pages and Jekyll. Use Bundler so the local site uses the same GitHub Pages gem set as the published site.

If Ruby 3.3.4 is not installed locally, install it with Homebrew-managed rbenv:

```sh
brew install rbenv ruby-build
rbenv install 3.3.4
rbenv local 3.3.4
gem install bundler -v 2.5.11
```

Then install the project gems and start the local server:

```sh
bundle install
bundle exec jekyll serve
```

Open <http://127.0.0.1:4000/nitinol-design-concepts/> in your browser. When GitHub Pages updates its supported gem set, run `bundle update github-pages` and commit the updated `Gemfile.lock`.

## Design Tutorial

This first series follows each step in the design and analysis of a realistic (but non-proprietary) laser cut nitinol component, from designing the geometry using Solidworks to shape setting and fatigue cycling using Abaqus.

* [Design](105-open-frame-design) \| Create a 3D model of a laser cut Open Frame component using Solidworks.
* [Mechanical Properties](110-material-characterization) \| Perform tensile testing to characterize mechanical properties for simulation.
* [Shape Setting](115-open-frame-shape-set) \| Expand the laser cut component into a complex expanded shape using Abaqus finite element analysis.
* [Fatigue Simulation](120-open-frame-fatigue) \| Apply fatigue loading conditions using Abaqus.

## SMST-17 Volumetric Methods

Building on the foundation of the example design and simulation material above, these next topics explore new methodologies and analysis approaches presented in "Volume weighted probabilistic methods for nitinol lifetime prediction" at [SMST-2017](http://www.asminternational.org/web/smst2017) in San Diego. You can find a [recording of the talk on YouTube](https://youtu.be/fGN6rWQzPnY). The slides and animations are [here on GitHub](https://github.com/confluentmedical/nitinol-design-concepts/tree/master/smst17).

* [Advancing Nitinol Fatigue Prediction](205-advancing-fatigue-prediction) \| A review of present and future approaches to lifetime prediction of superelastic nitinol.
* [Volumetric FEA Postprocessing](125-volumetric-analysis) \| Advanced scripting to extract volumetric stress and strain data from an Abaqus output database.
* [Volumetric characterization of inclusions from submicron CT scans](210-xct-methods) \| submicron xray tomography: methods and results
* [Probabilistic durability prediction using Monte-Carlo methods](215-monte-carlo) \| durability prediction methods combining submicron x-ray CT inclusion data with FEA results

## Cite this project

[![DOI](https://zenodo.org/badge/87218697.svg)](https://zenodo.org/badge/latestdoi/87218697)
