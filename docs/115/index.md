# Shape Setting

Objective: Expand a laser cut tubing component into a complex formed shape, using simulation to replicate the shape transformation in each physical heat treatment step. The output of this exercise is an expanded finite element model representing the finished component, and suitable for crimping or fatigue simulations.

Prerequisites: [NDC-110 Design](../105), [NDC-115 Mechanical Properties](../110), SIMULIA Abaqus 2017.

## Introduction

In [NDC-110 Design](../105) and [NDC-115 Mechanical Properties](../110), we created a design and characterized the material from which it is to be fabricated. Now it's time to dive into the world of computational simulation using finite element analysis (FEA), starting with an expansion analysis. 

We are often asked why use FEA to create expanded geometry; why not just create an expanded 3D geometry in Solidworks instead? Well, nitinol components are commonly formed in several steps, with intermediate heat treatments between each step. Each step imparts subtle influences in the shape, curvature, bend, and twist of design features that are difficult (or perhaps impossible) to replicate using conventional CAD. By matching the virtual expansion process step-for-step with the physical process, we can ensure that the virtual geometry is an accurate match with its physical counterpart. In fact, in a first iteration expansion simulation, a mismatch is quite common! The design, simulation, and prototyping cycle often includes adjustments to modeling assumptions (and/or physical tooling) to converge on a solution that matches the design intent. Let's get started!

## SIMULIA Abaqus

This example uses Abaqus 2017, a commercial finite element analysis package from Dassault Systèmes SIMULIA. This is the most widely used FEA package for nitinol computational simulation, and includes a material constituitive model designed specifically for unique characteristics of superelasticity. This model, based on the work of [Auricchio and Taylor](http://www.sciencedirect.com/science/article/pii/S0045782596011474) is based on a principle of additive strain decomposition. In this approach, the strain in each element can be a combination of an elastic, transformation, or plastic components. While there are more advanced constituitive models in development, the Abaqus implementation is well tested, robust, and still widely used. The superelasticity model can be used with Abaqus Standard for quasi-static simulations, or Abaqus Explicit for dynamic simulations. This example uses Standard, which is typically our first choice for nitinol medical component simulations.

We will assume that the reader is familiar with creating, running, and troubleshooting simulations in Abaqus, and we will not cover every detail of the model here. The original Abaqus CAE model files are available for download in this GitHub project, so please check them out and follow along.

## Import

The first step is to import the ACIS file.
![import][115-assembly.png]

