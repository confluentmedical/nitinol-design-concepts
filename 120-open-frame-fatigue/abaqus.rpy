# -*- coding: mbcs -*-
#
# Abaqus/CAE Release 2017 replay file
# Internal Version: 2016_09_27-14.54.59 126836
# Run by cbonsignore on Wed Apr 05 08:43:53 2017
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
    pathName='C:/Users/cbonsignore.NITINOL/Documents/GitHub/nitinol-design-concepts/120-open-frame-fatigue/open-frame-fatigue.cae')
#: The model database "C:\Users\cbonsignore.NITINOL\Documents\GitHub\nitinol-design-concepts\120-open-frame-fatigue\open-frame-fatigue.cae" has been opened.
session.viewports['Viewport: 1'].setValues(displayedObject=None)
p = mdb.models['open-frame-fatigue-v25mm-9pct'].parts['CONCEPT-D101-AS-CUT']
session.viewports['Viewport: 1'].setValues(displayedObject=p)
a = mdb.models['open-frame-fatigue-v25mm-9pct'].rootAssembly
session.viewports['Viewport: 1'].setValues(displayedObject=a)
session.viewports['Viewport: 1'].assemblyDisplay.setValues(step='crimp-10mm')
session.viewports['Viewport: 1'].assemblyDisplay.setValues(
    adaptiveMeshConstraints=ON, optimizationTasks=OFF, 
    geometricRestrictions=OFF, stopConditions=OFF)
session.viewports['Viewport: 1'].assemblyDisplay.setValues(step='Initial')
session.viewports['Viewport: 1'].assemblyDisplay.setValues(
    adaptiveMeshConstraints=OFF)
session.viewports['Viewport: 1'].assemblyDisplay.setValues(loads=ON, bcs=ON, 
    predefinedFields=ON, connectors=ON)
