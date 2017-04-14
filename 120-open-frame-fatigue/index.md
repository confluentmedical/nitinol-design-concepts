# Nitinol Component Fatigue Analysis

**Objective:** Deploy a nitinol component in a simulated use case, apply a fatigue loading condition, calculate mean strains and strain amplitudes, abd create a "point cloud" to predict fatigue performance. 

**Prerequisites:** [NDC-105 Open Frame Design](../105-open-frame-design), [NDC-115 Open Frame Shape Set](../115-open-frame-shape-set), Simulia Abaqus 2017

**Resources** The Abaqus CAE model database for this example can be downloaded from [this repository](https://github.com/cbonsig/nitinol-design-concepts/tree/master/120-open-frame-fatigue). The output database (65MB) can be downloaded from the 120-open-frame-fatigue folder at [nitinol.app.box.com/v/nitinol-design-concepts](https://nitinol.box.com/v/nitinol-design-concepts).

## Introduction

Superelastic nitinol has remarkable abilities to transform in shape, from large to small and back again. Intricate nitinol structures can also conform to complex anatomical constraints, and move with the body in an almost lifelike manner. Driven by increasing demand for minimally invasive medical treatments, nitinol components are deployed into demanding biomechanical environments like flexing limbs, and beating hearts. Designing for these fatigue conditions is a considerabe challenge, and one we will begin to explore in this example.

In the most broad terms, any fatigue simulation includes three essential components:

1. **Geometry**: The shape and form of the component of interest. We typically start a nitinol fatigue simulation with geometry that represents the expanded shape of the component, with finished feature dimensions. This example will use nominal dimensions; tolerance variations are an important consideration that will be excluded from this example. We will strart this simulation with the expanded geometry created in [[NDC-115 Open Frame Shape Set](../115-open-frame-shape-set).

2. **Material**: Material properties and constituitive model. Here will will use the tensile properties described in [NDC-110 Material Characterization](../110-material-characterization), derived from the same tubing material from which the component is fabricated, subjected to the same heat treatments as the formed component as well. This simulation uses the superelasticity constituitive model that has been included with Abaqus for many years.

3. **Boundary Conditions**: This is often the most challenging of the three components, as realistic biomechanical boundary conditions can be difficult to know with confidence. Usually there are several differnt loading modes to consider (e.g. cardiovascular pulsatile pressure changes, bending or axial deformation related to the gait cycle, crushing related to the respiratory cycle). For this example, we will apply a single fictional radial deformation cycle, just to show how the process works.

## Geometry

In [NDC-115 Open Frame Shape Set](../115-open-frame-shape-set), we transformed a laser cut component from a starting diameter of 8mm to a complex expanded shape 28-40mm in diameter. The formed geometry at the end of this simulation will be be starting geometry at the beginning of this simulation. To begin, we will import the deformed geometry from the last frame of the final step of the forming analysis. `shape-set.odb` (91MB) can be downloaded from the 115-open-frame-shape-set folder of [https://nitinol.box.com/v/nitinol-design-concepts](https://nitinol.box.com/v/nitinol-design-concepts).

![import-part](120-import-part.png)

*Note: in this example, we are importing the nodes and elements only, and therefore we lose all of the information about stress and strain history, and more importantly we also lose information about the original material orientation. This will be relevant later, when we wish to relate the local orientation of inclusions with the local orientation of stresses. This example will be revised in the future to use a "\*RESTART" approach, which allows for preservation of the original material orientation through the fatigue simulation.*

In this example, we will constrain the expanded component to a small diameter, then deploy it into a chamber having a similar shape. In each fatigue cycle, the chamber will shrink in diameter by a specified radial displacement, then expand to a second larger diameter. This simple model is similar to a physical test that might be performed to challenge pulsatile fatigue performance of such a component. We create the geometry for this chamber as a part in Abaqus CAE, as shown below.

![chamber-sketch](120-chamber-sketch.png)

We also use Abaqus CAE to create a cyndrical surface to constrain to frame from its large to small configuration, another to contact the inner surface at the minimimum constrained diameter. Instances of all parts are created in an assembly as shown below.

![assembly](120-assembly.png)

## Material Properties and Boundary Conditions

The nitinol material properties used in this example are identical to those used previously in [NDC-115 Open Frame Shape Set](../115-open-frame-shape-set). 
![material-properties](../115-open-frame-shape-set/115-material.png)

This simulation represents fatigue conditions in the human body, so the environmental temperature will be set to 37 degrees C for the entire analysis. *(this will lead to conservatively high stresses during the initial crimping step, which in reality is likely performed at or below 22 degrees C)*

![temperature](120-temperature.png)

This simulation is driven by contact between the frame component, cylinders, and chamber. We typically use hard contact with setting as shown below.

![interaction-property](120-interaction-property.png)

Contact interactions are created and modified as necessary at each step in the simulation.
![interaction](120-interaction.png)
![edit-interaction](120-edit-interaction.png)

Boundary condary conditions are applied and modified as necessary expand and contract the driving cylinders to crimp and deploy the stent. The diameter of the chamber is cycled between "systole" and "diastole" three times, allowing shakedown effects to stabilize.

![boundary-conditions](120-bc.png)

These simulations can quickly generate many gigabytes of results! We try to keep file sizes reasonable by limiting the number of times the full field output results are written to the output database. Ultimately, full results are only needed for the final frame of the the final systole and diastole cycles. It is useful to also have some results for the prior steps to confirm that the model is working as expected.

![field-outputs](120-field-output-create.png)

## TO > BE > CONTINUED

## Credits

This model was developed by Karthikeyan Senthilnathan, [@karthikSenthi](https://github.com/karthikSenthi), of Confluent Medical Technologies.




