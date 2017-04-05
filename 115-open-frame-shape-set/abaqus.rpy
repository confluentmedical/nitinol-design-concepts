# -*- coding: mbcs -*-
#
# Abaqus/CAE Release 2017 replay file
# Internal Version: 2016_09_27-14.54.59 126836
# Run by cbonsignore on Wed Apr 05 06:30:09 2017
#

# from driverUtils import executeOnCaeGraphicsStartup
# executeOnCaeGraphicsStartup()
#: Executing "onCaeGraphicsStartup()" in the site directory ...
from abaqus import *
from abaqusConstants import *
session.Viewport(name='Viewport: 1', origin=(0.0, 0.0), width=256.261901855469, 
    height=112.685722351074)
session.viewports['Viewport: 1'].makeCurrent()
session.viewports['Viewport: 1'].maximize()
from caeModules import *
from driverUtils import executeOnCaeStartup
executeOnCaeStartup()
openMdb(
    pathName='C:/Users/cbonsignore.NITINOL/Documents/GitHub/nitinol-design-concepts/115-open-frame-shape-set/open-frame-shape-set.cae')
#: The model database "C:\Users\cbonsignore.NITINOL\Documents\GitHub\nitinol-design-concepts\115-open-frame-shape-set\open-frame-shape-set.cae" has been opened.
session.viewports['Viewport: 1'].setValues(displayedObject=None)
p = mdb.models['shape-set-AV-OSS-D101-01'].parts['Concept-D101-as-cut']
session.viewports['Viewport: 1'].setValues(displayedObject=p)
#--- Recover file: 'open-frame-shape-set.rec' ---
# -*- coding: mbcs -*- 
from part import *
from material import *
from section import *
from optimization import *
from assembly import *
from step import *
from interaction import *
from load import *
from mesh import *
from job import *
from sketch import *
from visualization import *
from connectorBehavior import *
mdb.models['shape-set-AV-OSS-D101-01'].parts['Concept-D101-as-cut'].DatumCsysByThreePoints(
    coordSysType=CYLINDRICAL, name='cyl', origin=(0.0, 0.0, 0.0), point1=(1.0, 
    0.0, 0.0), point2=(0.0, -1.0, 0.0))
del mdb.models['shape-set-AV-OSS-D101-01'].parts['Concept-D101-as-cut'].features['cyl']
mdb.models['shape-set-AV-OSS-D101-01'].parts['Concept-D101-as-cut'].DatumCsysByThreePoints(
    coordSysType=CYLINDRICAL, name='cyl', origin=(0.0, 0.0, 0.0), point1=(0.0, 
    0.0, 1.0), point2=(0.0, -1.0, 0.0))
mdb.models['shape-set-AV-OSS-D101-01'].parts['Concept-D101-as-cut'].MaterialOrientation(
    additionalRotationField='', additionalRotationType=ROTATION_NONE, 
    angle=0.0, axis=AXIS_3, fieldName='', 
    localCsys=mdb.models['shape-set-AV-OSS-D101-01'].parts['Concept-D101-as-cut'].datums[77], 
    orientationType=SYSTEM, 
    region=mdb.models['shape-set-AV-OSS-D101-01'].parts['Concept-D101-as-cut'].sets['EALL'], 
    stackDirection=STACK_3)
mdb.models['shape-set-AV-OSS-D101-01'].rootAssembly.regenerate()
#--- End of Recover file ------
session.viewports['Viewport: 1'].partDisplay.setValues(sectionAssignments=ON, 
    engineeringFeatures=ON)
session.viewports['Viewport: 1'].partDisplay.geometryOptions.setValues(
    referenceRepresentation=OFF)
mdb.save()
#: The model database has been saved to "C:\Users\cbonsignore.NITINOL\Documents\GitHub\nitinol-design-concepts\115-open-frame-shape-set\open-frame-shape-set.cae".
