'''
ivolResults.004.py
==================

A Python script to extract volumetric strain and stress results from Abaqus
output database(s). Calculates mean stress and strain, stress and strain amplitude,
prestrain and prestress, and associated volume at each integration point. 
Exports data to a CSV file with one row per integration point.

Usage: abaqus python ivolResults.py 
      -odbName odbName
      [-oldOdb crimpOdbName]
      -partInstance partInstanceName (name of part instance)
      -crimpStepName crimpStepName  (name of crimping/prestrain step)
      -lastStepName lastStepName  (name of final unloading cycle step)
      [-overwrite yes]

oldOdb is optional, and may be used if crimping (prestrain) results are in a
different ODB from cyclic results.  The script creates a CSV file with the same 
job name as odbName, ending in .ivol.csv. If this file exists, script prompts 
for a new file name. The "-overwrite yes" option will override this protection.
All other parameters are mandatory.

Field output requests must include strain, stress, state dependant variables,
and integration point volume:
LE, S, SDV, IVOL

See header of CSV file for a definition of all columns:

Example with all results in a single ODB:
abaqus python ivolResults.py -od Job-2 -pa PART-1-1 -cr crimp-1 -la unolad-3 -ov yes    

Example with crimping and cyclic results in separate ODBs:
abaqus python ivolResults.py -od Job-2 -ol Job-1 -pa PART-1-1 -cr crimp-1 -la unolad-3 -ov yes
'''

'''
Column details
el     = element number
ip     = integration point
cycEM  = maximum principal cyclic mean strain
cycEA  = absolute maximum principal cyclic strain amplitude
cycTau = absolute maximum principal cyclic strain amplitude
cycSM  = maximum principal cyclic mean stress
cycSA  = absolute maximum principal cyclic stress amplitude
preE   = pre-strain (strain conditioning, e.g. strain during crimping)
preS   = pre-stress (stress conditioning, e.g. stress during crimping)
preP   = hydrostatic pressure during pre-conditioning (compression positive, tension negative)
preM   = volume fraction martensite during pre-conditioning
preV   = integration point volume during pre-conditioning
ldE    = maximum principal strain during loading frame of fatigue cycle
ldTau  = maximum shear strain during loading frame of fatigue cycle
ldS    = maximum principal stress during loading frame of fatigue cycle
ldP    = hydrostatic pressure during loading frame of fatigue cycle
ldM    = volume fraction martensite during loading frame of fatigue cycle
ldV    = integration point volume during loading frame of fatigue cycle
ulE    = maximum principal strain during unloading frame of fatigue cycle
ulTau  = maximum shear strain during unloading frame of fatigue cycle
ulS    = maximum principal stress during unloading frame of fatigue cycle
ulP    = hydrostatic pressure during unloading frame of fatigue cycle
ulM    = volume fraction martensite during unloading frame of fatigue cycle
ulV    = integration point volume during unloading frame of fatigue cycle
ldS11  = loading stress in material 1 direction (r)
ldS22  = loading stress in material 2 direction (theta)
ldS33  = loading stress in material 3 direction (Z)
ulS11  = unloading stress in material 1 direction (r)
ulS22  = unloading stress in material 2 direction (theta)
ulS33  = unloading stress in material 3 direction (Z)
'''
# original code by Craig Bonsignore
# github.com/cbonsig

# The MIT License (MIT)

# Copyright (c) 2017 Confluent Medical Technologies, Inc.

# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:

# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.

# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

'''
.001 first release
.002 add shear strain results. correct error in stress amplitude calculation
.003 add S11, S22, S33 components
.004 correction to overwritePref behavior
'''

import os
from sys import argv, exit
from odbAccess import *
from abaqusConstants import TRUE

#=================================================================
# outputToText
# Extract field output data from odb and write it to a text file

def outputToText(paramList):

    odbName = paramList[0]
    oldOdbName = paramList[1]
    partInstance = paramList[2]
    crimpStepName = paramList[3]
    lastStepName = paramList[4]
    outputFile = paramList[5]
    
    try: 
	odb=openOdb(odbName,readOnly = TRUE)
    except:
        print 'Error: Unable to open the specified odb %s.' %(odbName)
	print 'Verify that Abaqus version running this script matches ODB.'
        return

    if oldOdbName != None:
        try:
            crimpOdb=openOdb(oldOdbName,readOnly = TRUE)
        except:
            print 'Error: Unable to open the specified old ODB %s\n'%(oldOdbName)
            return
    else:
        crimpOdbName=odbName
        crimpOdb=odb


    availableSteps = crimpOdb.steps.keys()
    if crimpStepName not in availableSteps:
        print 'Error: The step %s does not exist in odb %s\n'\
              '\tCheck for the case in the step name.\n'\
              '\tIt should be one of these: %s' %(crimpStepName, crimpOdbName,availableSteps)
        print 'If the crimp results are in a different ODB, use the -oldOld option.'
        odb.close()
        crimpOdb.close()
        exit(0)

    availableSteps = odb.steps.keys()
    if lastStepName not in availableSteps:
        print 'Error: The step %s does not exist in odb %s\n'\
              '\tCheck for the case in the step name.\n'\
              '\tIt should be one of these: %s' %(lastStepName, odbName, availableSteps)
        odb.close()
        crimpOdb.close()
        return
    
    availablePartInstances = odb.rootAssembly.instances.keys()
    if partInstance not in availablePartInstances and\
        partInstance != 'ASSEMBLY':
        print 'Error: The part instance %s does not exist in the odb %s.\n'\
              '\tCheck for the case of the part instance name.\n'\
              '\tIt should be one of these: %s' % (partInstance,odbName,availablePartInstances)
        return

    availablePartInstances = crimpOdb.rootAssembly.instances.keys()
    if partInstance not in availablePartInstances and\
       partInstance != 'ASSEMBLY':
        print 'Error: The part instance %s does not exist in the odb %s.\n'\
              '\tCheck for the case of the part instance name.\n'\
              '\tIt should be one of these: %s' % (partInstance,crimpOdbName,availablePartInstances)
        return
    
    # define frames of interest
    crimpFrame = crimpOdb.steps[crimpStepName].frames[-1]
    loadFrame = odb.steps[lastStepName].frames[0]
    unloadFrame = odb.steps[lastStepName].frames[-1]

    # tensors for crimping frame
    crimpLE = crimpOdb.steps[crimpStepName].frames[-1].fieldOutputs['LE'].values
    crimpS = crimpOdb.steps[crimpStepName].frames[-1].fieldOutputs['S'].values

    # tensors for loading and unloading frame of cycle
    loadFieldLE = odb.steps[lastStepName].frames[0].fieldOutputs['LE']
    loadFieldS = odb.steps[lastStepName].frames[0].fieldOutputs['S']
    unloadFieldLE = odb.steps[lastStepName].frames[-1].fieldOutputs['LE']
    unloadFieldS = odb.steps[lastStepName].frames[-1].fieldOutputs['S']

    # calculate tensor mean and amplitude values
    meanLE = 0.5*(loadFieldLE+unloadFieldLE)
    ampLE = 0.5*(loadFieldLE-unloadFieldLE)
    meanS = 0.5*(loadFieldS+unloadFieldS)
    ampS = 0.5*(loadFieldS-unloadFieldS)

    # calculate volume at each frame of interest
    crimpIVOL = crimpFrame.fieldOutputs['IVOL'].values
    loadIVOL = loadFrame.fieldOutputs['IVOL'].values
    unloadIVOL = unloadFrame.fieldOutputs['IVOL'].values

    # calculate martensite volume percent transformation
    crimpSDV21 = crimpFrame.fieldOutputs['SDV21'].values
    loadSDV21 = loadFrame.fieldOutputs['SDV21'].values
    unloadSDV21 = unloadFrame.fieldOutputs['SDV21'].values

    nRows = len(crimpLE)
    vTotal = 0
    cycEAmax = 0
    cycEMmax = 0

    #####
    ##### CRIMP (prestrain) frame results
    #####

    # store element labels and crimp strains
    el = []
    ip = []
    preE =[]
    for v in crimpLE:
        el.append(v.elementLabel)
        ip.append(v.integrationPoint)
        preE.append(v.maxPrincipal)

    # store crimp stress
    preS = []
    preP = []
    for v in crimpS:
        preS.append(v.maxPrincipal)
        preP.append(v.press)

    # store crimp IVOL
    preV = []
    for v in crimpIVOL:
        preV.append(v.data)
        vTotal = vTotal + v.data

    # store crimp volume fraction martensite
    preM = []
    for v in crimpSDV21:
        preM.append(v.data)

    #####
    ##### LOAD (fatigue+) frame results
    #####

    # store load frame strain
    ldE = []
    for v in loadFieldLE.values:
        ldE.append(v.maxPrincipal)

    # store load frame stress
    # .003 add S11, S22, S33
    ldS = []
    ldP = []
    ldS11 = []
    ldS22 = []
    ldS33 = []
    for v in loadFieldS.values:
        ldS.append(v.maxPrincipal)
        ldP.append(v.press)
        ldS11.append(v.data[0]) #S11
        ldS22.append(v.data[1]) #S22
        ldS33.append(v.data[2]) #S33

    # store IVOL for loading frame
    ldV = []
    for v in loadIVOL:
        ldV.append(v.data)

    # .002 max and min principal strains, shear
    # .003 add E11, E22, E33
    ldE1 = []
    ldE3 = []
    ldTau = []
    ldE11 = []
    ldE22 = []
    ldE33 = []
    for v in loadFieldLE.values:
        minPrincipalStrain = v.minPrincipal
        maxPrincipalStrain = v.maxPrincipal
        maxTau = abs(maxPrincipalStrain - minPrincipalStrain)/2
        ldE1.append(v.minPrincipal)
        ldE3.append(v.maxPrincipal)
        ldTau.append(maxTau)
        ldE11.append(v.data[0]) #E11
        ldE22.append(v.data[1]) #E22
        ldE33.append(v.data[2]) #E33

    # store volume fraction martensite for loading frame
    ldM = []
    for v in loadSDV21:
        ldM.append(v.data)

    #####
    ##### UNLOAD (fatigue-) frame results
    #####

    # store unload frame strain
    ulE = []
    for v in unloadFieldLE.values:
        ulE.append(v.maxPrincipal)

    # store unload frame stress
    # .003 add S11, S22, S33
    ulS = []
    ulP = []
    ulS11 = []
    ulS22 = []
    ulS33 = []
    for v in unloadFieldS.values:
        ulS.append(v.maxPrincipal)
        ulP.append(v.press)
        ulS11.append(v.data[0]) #S11
        ulS22.append(v.data[1]) #S22
        ulS33.append(v.data[2]) #S33

    # store IVOL for unloading frame
    ulV = []
    for v in unloadIVOL:
        ulV.append(v.data)

    # store volume fraction martensite for unloading frame
    ulM = []
    for v in unloadSDV21:
        ulM.append(v.data)

    # .002 max and min principal strains, shear
    ulE1 = []
    ulE3 = []
    ulTau = []
    ulE11 = []
    ulE22 = []
    ulE33 = []
    for v in unloadFieldLE.values:
        minPrincipalStrain = v.minPrincipal
        maxPrincipalStrain = v.maxPrincipal
        maxTau = abs(maxPrincipalStrain - minPrincipalStrain)/2
        ulE1.append(v.minPrincipal)
        ulE3.append(v.maxPrincipal)
        ulTau.append(maxTau)
        ulE11.append(v.data[0]) #e11
        ulE22.append(v.data[0]) #e22
        ulE33.append(v.data[0]) #e33

    #####
    ##### CYCLE results
    #####

    # store mean strain, and update maximum mean strain
    cycEM = []
    for v in meanLE.values:
        cycEM.append(v.maxPrincipal)
        if v.maxPrincipal > cycEMmax:
            cycEMmax = v.maxPrincipal

    #store strain amplitude, and update maxumum strain amplitude
    cycEA = []
    for v in ampLE.values:
        cycE3 = v.maxPrincipal
        cycE1 = v.minPrincipal
        if abs(cycE3) > abs(cycE1):
            cycE3abs = cycE3
        else:
            cycE3abs = cycE1
        cycEA.append(cycE3abs)
        if abs(cycE3abs) > abs(cycEAmax):
            cycEAmax = cycE3abs

    # .002 cyclic shear strain
    cycTau = []
    for v in ampLE.values:
        cycE3 = v.maxPrincipal
        cycE1 = v.minPrincipal
        tau = abs(cycE3 - cycE1)/2
        cycTau.append(tau)

    # store mean stress
    cycSM = []
    for v in meanS.values:
        cycSM.append(v.maxPrincipal)

    #store stress amplitude
    cycSA = []
    for v in ampS.values:
        s3 = v.maxPrincipal
        s1 = v.minPrincipal
        if abs(s3) > abs(s1):
            s3abs = s3
        else:
            s3abs = s1
        cycSA.append(s3abs)
    
    #####
    ##### Write output file
    #####

    file1=open(outputFile,'w')

    if oldOdbName == None:
        oldOdbLabel = odbName
    else:
        oldOdbLabel = oldOdbName
    
    # write summary info at top of file 
    headerString = ''
    headerString += 'Results from ivolResults.py\n'
    headerString += '===========================\n'
    headerString += 'Output database:                        odb      = %s\n' % odbName
    headerString += 'Crimping (prestrain) output database:   oldOdb   = %s\n' % oldOdbLabel
    headerString += 'Number of integration points:           nRows    = %i\n' % nRows
    headerString += 'Total volume:                           vTotal   = %G\n' % vTotal
    headerString += 'Maximum mean strain:                    cycEMmax = %G\n' % cycEMmax
    headerString += 'Maximum strain amplitude (abs):         cycEAmax = %G\n' % cycEAmax
    file1.write(headerString)

    # print summary header to screen
    print('\n')
    print(headerString)

    # write column descriptions to CSV file
    columnDescription = ''
    columnDescription += '-----------------------------------------------------------------------------------------------\n'
    columnDescription += 'el     = element number\n'
    columnDescription += 'ip     = integration point\n'
    columnDescription += 'cycEM  = maximum principal cyclic mean strain\n'
    columnDescription += 'cycEA  = absolute maximum principal cyclic strain amplitude\n'
    columnDescription += 'cycTau = cyclic maximum shear strain\n'
    columnDescription += 'cycSM  = maximum principal cyclic mean stress\n'
    columnDescription += 'cycSA  = absolute maximum principal cyclic stress amplitude\n'
    columnDescription += 'preE   = pre-strain (strain conditioning, e.g. strain during crimping)\n'
    columnDescription += 'preS   = pre-stress (stress conditioning, e.g. stress during crimping)\n'
    columnDescription += 'preP   = hydrostatic pressure during pre-conditioning (compression positive, tension negative)\n'
    columnDescription += 'preM   = volume fraction martensite during pre-conditioning\n'
    columnDescription += 'preV   = integration point volume during pre-conditioning\n'
    columnDescription += 'ldE    = maximum principal strain during loading frame of fatigue cycle\n'
    columnDescription += 'ldTau  = maximum shear strain during loading frame of fatigue cycle\n'
    columnDescription += 'ldS    = maximum principal stress during loading frame of fatigue cycle\n'
    columnDescription += 'ldP    = hydrostatic pressure during loading frame of fatigue cycle\n'
    columnDescription += 'ldM    = volume fraction martensite during loading frame of fatigue cycle\n'
    columnDescription += 'ldV    = integration point volume during loading frame of fatigue cycle\n'
    columnDescription += 'ulE    = maximum principal strain during unloading frame of fatigue cycle\n'
    columnDescription += 'ulTau  = maximum shear strain during unloading frame of fatigue cycle\n'
    columnDescription += 'ulS    = maximum principal stress during unloading frame of fatigue cycle\n'
    columnDescription += 'ulP    = hydrostatic pressure during unloading frame of fatigue cycle\n'
    columnDescription += 'ulM    = volume fraction martensite during unloading frame of fatigue cycle\n'
    columnDescription += 'ulV    = integration point volume during unloading frame of fatigue cycle\n'
    columnDescription += 'ldS11  = loading stress in material 1 direction (r)\n'
    columnDescription += 'ldS22  = loading stress in material 2 direction (theta)\n'
    columnDescription += 'ldS33  = loading stress in material 3 direction (Z)\n'
    columnDescription += 'ulS11  = unloading stress in material 1 direction (r)\n'
    columnDescription += 'ulS22  = unloading stress in material 2 direction (theta)\n'
    columnDescription += 'ulS33  = unloading stress in material 3 direction (Z)\n'
    columnDescription += 'ldE11  = loading strain in material 1 direction (r)\n'
    columnDescription += 'ldE22  = loading strain in material 2 direction (theta)\n'
    columnDescription += 'ldE33  = loading strain in material 3 direction (Z)\n'
    columnDescription += 'ulE11  = unloading strain in material 1 direction (r)\n'
    columnDescription += 'ulE22  = unloading strain in material 2 direction (theta)\n'
    columnDescription += 'ulE33  = unloading strain in material 3 direction (Z)\n'
    columnDescription += '-----------------------------------------------------------------------------------------------\n'
    file1.write(columnDescription)

    # write column names
    str = 'el, ip, cycEM, cycEA, cycTau, cycSM, cycSA, preE, preS, preP, preM, preV, ldE, ldTau, ldS, ldP, ldM, ldV, ulE,' \
          'ulTau, ulS, ulP, ulM, ulV,'\
          'ldS11, ldS22, ldS33, ulS11, ulS22, ulS33,' \
          'ldE11, ldE22, ldE33, ulE11, ulE22, ulE33\n'
    file1.write(str)

    # write rows of data
    for i in range(nRows):
        str = '%i, %i,'\
              '%G, %G, %G, %G, %G, '\
              '%G, %G, %G, %G, %G, '\
              '%G, %G, %G, %G, %G, %G, '\
              '%G, %G, %G, %G, %G, %G, '\
              '%G, %G, %G, %G, %G, %G, '\
              '%G, %G, %G, %G, %G, %G\n' % \
        (el[i], ip[i], \
            cycEM[i], cycEA[i], cycTau[i], cycSM[i],  cycSA[i], \
            preE[i],  preS[i],  preP[i],   preM[i],   preV[i], \
            ldE[i],   ldTau[i], ldS[i],    ldP[i],    ldM[i],   ldV[i], \
            ulE[i],   ulTau[i], ulS[i],    ulP[i],    ulM[i],   ulV[i], \
            ldS11[i], ldS22[i], ldS33[i],  ulS11[i],  ulS22[i],  ulS33[i], \
            ldE11[i], ldE22[i], ldE33[i],  ulE11[i],  ulE22[i],  ulE33[i])
        file1.write(str)

    # close files and exit
    file1.close()
    print 'Output successfully written to the file: %s\n' %(outputFile)
    odb.close()
    try:
        crimpOdb.close()
    except:
        pass
    return

#=================================================================
# rightTrim
# Helper function to add a missing suffix to a file name
def rightTrim(input,suffix):
    if (input.find(suffix) == -1):
        input = input + suffix
    return input

#==================================================================
# S T A R T
#    
if __name__ == '__main__':    

    # initialize parameters
    odbName = None
    oldOdbName = None
    partInstance =None
    crimpStepName = None
    lastStepName = None
    outputFileName = None
    overwritePref = None
    paramList = []

    # grab the arguments passed on the command line
    argList = argv
    argCount = len(argList)
    
    # parse the parameters from the argument list
    i=0
    try:
        while (i < argCount):
            if (argList[i][:3] == "-od"):
                i+=1
                name = argList[i]
                odbName = rightTrim(name, '.odb')
            elif (argList[i][:3] == "-ol"):
                i+=1
                name = argList[i]
                oldOdbName = rightTrim(name, '.odb')
            elif (argList[i][:3] == "-pa"):
                i+=1
                # part instance names must be SHOUTED IN ALL CAPS for some reason
                partInstance = argList[i].upper()
            elif (argList[i][:3] == "-cr"):
                i+=1
                crimpStepName = argList[i]
            elif (argList[i][:3] == "-la"):
                i+=1
                lastStepName = argList[i]
            elif (argList[i][:3] == "-ov"):
                i+=1
                overwritePref = argList[i]
            elif (argList[i][:3] == "-he"):
                print __doc__
                exit(0)
            i+=1
            
        # fail if any required arguments are not provided
        if None in (odbName, partInstance, crimpStepName, lastStepName):
            print "***ERROR: All required arguments are not provided"
            print __doc__
            exit(0)
 
    except IndexError:
        print "***ERROR: All required arguments are not provided"
        print __doc__
        exit(0)

    # create output file name
    baseName = odbName[:-4]
    outputFileName = baseName + '.ivol.csv'

    # check for overwrite preference
    positive = ['Y', 'y', 'Yes', 'yes', 'T', 'True', 'TRUE']
    if overwritePref in positive:
        overwrite = True
    else:
        overwrite = False

    # check for existing output file
    if overwrite != True:
        msg = 'The output file %s already exists. Do you want to overwrite\n'\
              'the existing file? (Y/N)\n' %(outputFileName)
        msg1 = 'Please enter the file name to write the output.\n'
        positive = ['Y', 'y', 'Yes', 'yes']
        negative = ['N', 'n', 'No', 'no']

        #Prompt user to enter a different output file name if the specified file already exists.
        if os.path.isfile(outputFileName):
            response = raw_input(msg).strip()
            if response in negative:
                outputFileName = raw_input(msg1).strip()
            elif response in positive:
                print 'The file %s will be overwritten.\n' %(outputFileName)
            else:
                print 'Not a valid response.\n'
                exit(0)

    paramList = [odbName, oldOdbName, partInstance, crimpStepName, lastStepName, outputFileName]

    # pass parameters to he function that does all the work
    outputToText(paramList)
