# Design

**Objective:** Create a 3D solid expandable frame design suitable for laser cutting from nitinol tubing, including a planar form to create a toolpath, a wrapped form to visualize the actual geometry, and a symmetrical subset for finite element analysis. 

**Prerequisites:** Solidworks 2016.

## Introduction

Many nitinol medical components take the form of expandable patterned stuctures laser cut from tubing, including vascular stents, vena cava filters, neurovascular clot retreivers, and transcatheter heart valve frames. In this design example, we will extend methods described in [Open Stent Design](https://github.com/cbonsig/open-stent) to create an expandable frame similar in form to nitinol components used for transcatheter valves. This frame is expanded to a contoured diameter ranging from 28-40mm, and can be crimped to a profile of 10mm. A real medical component would have strict performance requirements for radial stiffness, fatigue durability, and crimped profile, for a range of expected clinical loading conditions. Fortunately for us, this example design is unconstrained by any of those concerns! It only needs to look cool, and hopefully teach us something about how to create similar structures that may be more useful.

