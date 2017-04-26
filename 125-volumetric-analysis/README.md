# Volumetric analysis of FEA results

**Objective:** Develop tools for volumetric assessment of cyclic stresses, strains, and phase changes related to the fatigue cycle.

**Prerequisites:** [NDC-105 Open Frame Design](../105-open-frame-design), [NDC-115 Open Frame Shape Set](../115-open-frame-shape-set), [NDC-120 Open Frame Fatigue Analysis](../120-open-frame-fatigue), Simulia Abaqus 2017

**Resources** Python and R scripts used for this example can be found in [this repository](.). The output database (65MB) processed in this example can be downloaded from the 120-open-frame-fatigue folder at [nitinol.app.box.com/v/nitinol-design-concepts](https://nitinol.box.com/v/nitinol-design-concepts).

## Introduction

[Open Frame Fatigue Analysis](../120-open-frame-fatigue) concluded with extracting mean strain and strain amplitude from every integration point in the model, and creating a *point cloud* plot to asses the fatigue performance of the example design and loading condition. In this example, we will develop scripts to extract and analyze more information from the simulation, including volumetric measures or pre-strain, cyclic stress and strain, and phase changes.

## Simulation results

In [Open Frame Fatigue Analysis](../120-open-frame-fatigue), we created a finite element analysis simulation of crimping, deployment, and fatigue cycling of a generic nitinol frame component. If you followed along using Abaqus, you have already created the 65MB output database for this simulation. If not, the file can be downloaded from the 120-open-frame-fatigue folder at [nitinol.app.box.com/v/nitinol-design-concepts](https://nitinol.box.com/v/nitinol-design-concepts). The scripts in the following section will be used to process this ODB.

