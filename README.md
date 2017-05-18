Nitinol Design Concepts
================================

**Welcome SMST 2017 attendees!** _Confluent Medical presentations will be posted to our nitinol reference library at [nitinol.com](http://nitinol.com) before the end of the conference._

This project includes tutorials and examples related to design and simulation of superelastic nitinol components. This content is provided by [Confluent Medical Technologies](http://confluentmedical.com) as a resource for our customers, industry and community. If you want to know more about the background, or how you can contribute, read [about this project](about.md).

The material here includes a deeper dive into topic covered in our Nitinol University courses, as well as research supporting scientific presentations and publications. The [Design Tutorial](#design-tutorial) series provides an introduction to design and simulation of a nitinol component, following methods that are commonly applied in the medical device industry. The [Advanced Topics](#advanced-topics) series ventures into some more speculative territory, including new and emerging approaches that we find interesting. 

## Design Tutorial

This first series follows each step in the design and analysis of a realistic (but non-proprietary) laser cut nitinol component, from designing the geometry using Solidworks to shape setting and fatigue cycling using Abaqus.

* [Design](105-open-frame-design) \| Create a 3D model of a laser cut Open Frame component using Solidworks.
* [Mechanical Properties](110-material-characterization) \| Perform tensile testing to characterize mechanical properties for simulation.
* [Shape Setting](115-open-frame-shape-set) \| Expand the laser cut component into a complex expanded shape using Abaqus finite element analysis.
* [Fatigue Simulation](120-open-frame-fatigue) \| Apply fatigue loading conditions using Abaqus.

## Advanced Topics

Building on the foundation of the example design and simulation material above, these next topics explore new methodologies and analysis approaches that we are currently researching. This is work in progress, so proceed with caution!

* [Advancing Nitinol Fatigue Prediction](205-advancing-fatigue-prediction) \| A review of present and future approaches to lifetime prediction of superelastic nitinol.
* [Volumetric FEA Postprocessing](125-volumetric-analysis) \| Advanced scripting to extract volumetric stress and strain data from an Abaqus output database.
* [Volumetric characterization of inclusions from submicron CT scans](210-xct-methods) \| submicron xray tomography: methods and results
* [Probabilistic durability prediction using Monte-Carlo methods](215-monte-carlo) \| durability prediction methods combining submicron x-ray CT inclusion data with FEA results

