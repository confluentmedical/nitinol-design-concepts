# -*- coding: mbcs -*-
#
# Abaqus/CAE Release 2017 replay file
# Internal Version: 2016_09_27-14.54.59 126836
# Run by cbonsignore on Wed Apr 05 10:17:38 2017
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
a = mdb.models['shape-set-AV-OSS-D101-01'].rootAssembly
session.viewports['Viewport: 1'].setValues(displayedObject=a)
session.viewports['Viewport: 1'].assemblyDisplay.setValues(
    adaptiveMeshConstraints=ON, optimizationTasks=OFF, 
    geometricRestrictions=OFF, stopConditions=OFF)
import os
os.chdir(
    r"C:\Users\cbonsignore.NITINOL\Documents\GitHub\nitinol-design-concepts\120-open-frame-fatigue")
openMdb(
    pathName='C:/Users/cbonsignore.NITINOL/Documents/GitHub/nitinol-design-concepts/120-open-frame-fatigue/open-frame-fatigue.cae')
#: The model database "C:\Users\cbonsignore.NITINOL\Documents\GitHub\nitinol-design-concepts\120-open-frame-fatigue\open-frame-fatigue.cae" has been opened.
a = mdb.models['open-frame-fatigue-v25mm-9pct'].rootAssembly
session.viewports['Viewport: 1'].setValues(displayedObject=a)
a = mdb.models['open-frame-fatigue-v25mm-9pct'].rootAssembly
session.viewports['Viewport: 1'].setValues(displayedObject=a)
mdb.models['open-frame-fatigue-v25mm-9pct'].setValues(
    restartJob='../115/shape-set', restartStep='constrain-sleeve')
mdb.saveAs(
    pathName='C:/Users/cbonsignore.NITINOL/Documents/GitHub/nitinol-design-concepts/120-open-frame-fatigue/open-frame-fatigue-restart.cae')
#: The model database has been saved to "C:\Users\cbonsignore.NITINOL\Documents\GitHub\nitinol-design-concepts\120-open-frame-fatigue\open-frame-fatigue-restart.cae".
session.viewports['Viewport: 1'].assemblyDisplay.setValues(
    adaptiveMeshConstraints=OFF)
mdb.Job(name='open-frame-fatigue-v25mm-9pct-restart', 
    model='open-frame-fatigue-v25mm-9pct', description='', type=RESTART, 
    atTime=None, waitMinutes=0, waitHours=0, queue=None, memory=90, 
    memoryUnits=PERCENTAGE, getMemoryFromAnalysis=True, 
    explicitPrecision=SINGLE, nodalOutputPrecision=SINGLE, echoPrint=OFF, 
    modelPrint=OFF, contactPrint=OFF, historyPrint=OFF, userSubroutine='', 
    scratch='', resultsFormat=ODB, multiprocessingMode=DEFAULT, numCpus=1, 
    numGPUs=0)
mdb.models['open-frame-fatigue-v25mm-9pct'].setValues(
    restartJob='../115-open-frame-shape-set/shape-set')
mdb.models['open-frame-fatigue-v25mm-9pct'].setValues(restartJob='shape-set')
mdb.models['open-frame-fatigue-v25mm-9pct'].setValues(
    restartStep='CONSTRAIN-SLEEVE')
mdb.models['open-frame-fatigue-v25mm-9pct'].setValues(
    restartStep='constrain-sleeve')
session.viewports['Viewport: 1'].partDisplay.setValues(sectionAssignments=ON, 
    engineeringFeatures=ON)
session.viewports['Viewport: 1'].partDisplay.geometryOptions.setValues(
    referenceRepresentation=OFF)
p1 = mdb.models['open-frame-fatigue-v25mm-9pct'].parts['CONCEPT-D101-AS-CUT']
session.viewports['Viewport: 1'].setValues(displayedObject=p1)
a = mdb.models['open-frame-fatigue-v25mm-9pct'].rootAssembly
session.viewports['Viewport: 1'].setValues(displayedObject=a)
