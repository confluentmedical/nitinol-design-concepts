# postprocessFEA.R

# Copyright 2017 Confluent Medical Technologies
# Released as part of nitinol-design-concepts
# https://github.com/confluentmedical/nitinol-design-concepts
# under terms of Apache 2.0 license
# http://www.apache.org/licenses/LICENSE-2.0.txt

# post-process FEA results. create point clouds. calculate volume of
# material exceeding strain amplitude thresholds. calculate volume of
# material transforming to martensite, cycling between A and M ,etc.
#
# IN:  .CSV file in current folder, created by ivolResults.py
# OUT: .PDF and PNG figures to ./pdf and ./png folders
#      .CSV file to ./out folder
#
# NEXT: mergeResults.R to combine ./out/*.csv into one summary .csv

# Clear environment and load packages -----------------------------------------

rm(list=ls())
library(tidyverse) # http://r4ds.had.co.nz
library(forcats) # http://r4ds.had.co.nz/factors.html

# File selection --------------------------------------------------------------

# index number of the file to process
# manually change this from 1 to (qty of files) and re-source this script
# file must end with ".ivol.csv"
fileSelect <- 1

# Helper functions  -----------------------------------------------------------

# function to save file as PDF and PNG
# PDF files are generally preferred, but
# get large and unwieldy with many points are plotted
savePdfPng <- function(name){
  ggsave(paste('pdf/',ident,'-',name,'.pdf',sep=''),
         width=8,height=6)
  ggsave(paste('png/',ident,'-',name,'.png',sep=''),
         width=8,height=6,dpi = 300)
}

# Setup -----------------------------------------------------------------------

# strain axis limits. replace NA with desired values.
limitEM <- NA
limitEA <- NA
limitSWT <- NA

# stress axis limits. replace NA with desired values.
limitSM <- NA
limitSA <- NA

# symmetry factor. if the FEA model represents 1/16 of the full component,
# sett this to 16. all volumes are multiplied by this value.
symmetry <- 16

# Read files ------------------------------------------------------------------

# set working directory to location of this script
setwd(dirname(rstudioapi::getActiveDocumentContext()$path)) 

# create a list of files in the specified directory
files <- list.files(path = "./", pattern = "\\.ivol.csv$",
                    full.names = TRUE, recursive = FALSE)

# read selected file
resultsFile <- files[fileSelect]
baseName <- basename(resultsFile)
baseName <- substring(baseName,1,nchar(baseName)-9)
#ident <- substring(baseName,17,24)
ident <- baseName

# create folders for results if they do not already exist
dir.create('pdf', showWarnings = FALSE)
dir.create('png', showWarnings = FALSE)
dir.create('out', showWarnings = FALSE)

# define column types 
# readr will usually guess these correctly, but can get confused
# if many rows are 0 followed by some rows with a decimal value like 0.123456
# as is often the case for ldM and ulM (martensite volume fraction)
columnTypes = list(col_integer(), # el     = element number
                   col_integer(), # ip     = integration point
                   col_double(),  # cycEM  = maximum principal cyclic mean strain
                   col_double(),  # cycEA  = absolute maximum principal cyclic strain amplitude
                   col_double(),  # cycTau = cyclic maximum shear strain
                   col_double(),  # cycSM  = maximum principal cyclic mean stress
                   col_double(),  # cycSA  = absolute maximum principal cyclic stress amplitude
                   col_double(),  # preE   = pre-strain (strain conditioning, e.g. strain during crimping)
                   col_double(),  # preS   = pre-stress (stress conditioning, e.g. stress during crimping)
                   col_double(),  # preP   = hydrostatic pressure during pre-conditioning (compression positive, tension negative)
                   col_double(),  # preM   = volume fraction martensite during pre-conditioning
                   col_double(),  # preV   = integration point volume during pre-conditioning
                   col_double(),  # ldE    = maximum principal strain during loading frame of fatigue cycle
                   col_double(),  # ldTau  = maximum shear strain during loading frame of fatigue cycle
                   col_double(),  # ldS    = maximum principal stress during loading frame of fatigue cycle
                   col_double(),  # ldP    = hydrostatic pressure during loading frame of fatigue cycle
                   col_double(),  # ldM    = volume fraction martensite during loading frame of fatigue cycle
                   col_double(),  # ldV    = integration point volume during loading frame of fatigue cycle
                   col_double(),  # ulE    = maximum principal strain during unloading frame of fatigue cycle
                   col_double(),  # ulTau  = maximum shear strain during unloading frame of fatigue cycle
                   col_double(),  # ulS    = maximum principal stress during unloading frame of fatigue cycle
                   col_double(),  # ulP    = hydrostatic pressure during unloading frame of fatigue cycle
                   col_double(),  # ulM    = volume fraction martensite during unloading frame of fatigue cycle
                   col_double(),  # ulV    = integration point volume during unloading frame of fatigue cycle
                   col_double(),  # ldS11  = loading stress in material 1 direction (r)
                   col_double(),  # ldS22  = loading stress in material 2 direction (theta)
                   col_double(),  # ldS33  = loading stress in material 3 direction (Z)
                   col_double(),  # ulS11  = unloading stress in material 1 direction (r)
                   col_double(),  # ulS22  = unloading stress in material 2 direction (theta)
                   col_double(),  # ulS33  = unloading stress in material 3 direction (Z)
                   col_double(),  # ldE11  = loading strain in material 1 direction (r)
                   col_double(),  # ldE22  = loading strain in material 2 direction (theta)
                   col_double(),  # ldE33  = loading strain in material 3 direction (Z)
                   col_double(),  # ulE11  = unloading strain in material 1 direction (r)
                   col_double(),  # ulE22  = unloading strain in material 2 direction (theta)
                   col_double()   # ulE33  = unloading strain in material 3 direction (Z)
                   )

# create a data frame (table) from the CSV
# skip the header rows at the top of the file
# use the strings in the next row as column names
# explicitly define column types from list defined above
df <- read_csv(resultsFile, skip=46, col_names = TRUE, col_types = columnTypes)

# Pre-process the data --------------------------------------------------------

# adjust volume values to account for symmetry
# ("mutate" adds a new column to the data frame)
df <- df %>%
  mutate(preV = preV * symmetry,
         ldV  = ldV * symmetry,
         ulV  = ulV * symmetry)

# Fatigue fractures will not propogate in compression.
# We know the pressure at element at two points: the loaded and unloaded cyclic frame.
# negative pressure = hydrostatic tension, positive pressure = hydrostatic compression
# "AND" condition: a point is in tension in both frames
# "OR" condition: a point is in tension in one of the two frames
# "MEAN" condition: average of load and unload pressure is in tension
# In some conditions, the unload cycle can move some points into compression,
# so if we strictly require the "AND" condition, we will discard potentially important points.
# Alternatively, the "OR" condition can allow inclusion of many points that are 
# in tension for only a small part of the cycle.
# if a point is in tension in at least one of the two frames (OR condition), 
# negative pressure is tension ... TRUE if in tension at any part of fatigue cycle
df <- df %>%
  mutate(cyc.Tension.OR    = if_else(((ldP <= 0) | (ulP <= 0)), TRUE, FALSE),
         cyc.Tension.AND   = if_else(((ldP <= 0) & (ulP <= 0)), TRUE, FALSE),
         cyc.Tension.MEAN  = if_else((0.5*(ldP+ulP)) <= 0, TRUE, FALSE)) %>%
  rowwise() %>%
  mutate(cyc.Tension.10pctl = if_else( (min(ldP,ulP)+(abs(ldP-ulP)/10) ) <= 0,TRUE,FALSE),
         cyc.Tension.50pctl = if_else( (0.5*(ldP+ulP) ) <= 0,TRUE,FALSE),
         cyc.Tension.90pctl = if_else( (max(ldP,ulP)-(abs(ldP-ulP)/10) ) <= 0,TRUE,FALSE))

# the 90th percentile value is closest to the most conservative "OR" condition,
# but allows inclusion of points that slip just into compression for part of the
# unloading cycle. Experiment with different options by changing the next line.
df$cyc.Tension <- df$cyc.Tension.90pctl


# Generate raw point cloud ----------------------------------------------------

p0 <- ggplot(data=df) +
  geom_point(mapping = aes(x=cycEM,y=cycEA,color=cyc.Tension), alpha=0.2) + 
  scale_x_continuous(limits = c(0,limitEM) , labels = scales::percent) +
  scale_y_continuous(limits = c(NA,limitEA), labels = scales::percent) +
  scale_color_brewer(palette="Set1") +
  xlab(expression(epsilon["m"])) +
  ylab(expression(epsilon["a"])) +
  ggtitle('Raw point cloud, highlighting points in hydrostatic tension/compression',baseName)
plot(p0)
savePdfPng('p00')

# Disregard elements in compression -------------------------------------------

# preserve the original data frame in case we want it later
df.original <- df

# set amplitudes to ZERO if the point is in compression
df <- df %>%
  mutate(cycEA  = if_else(cyc.Tension==FALSE,0,cycEA),
         cycSA  = if_else(cyc.Tension==FALSE,0,cycSA),
         cycTau = if_else(cyc.Tension==FALSE,0,cycTau) )


# test for positive difference in strain for (load-unload)
# preserve the original signed data in new columns, then
# flip the sign of the negative amplitudes to positive
df <- df %>%
  mutate(cycEA.pos = ifelse(cycEA > 0, TRUE, FALSE),
         cycSA.pos = ifelse(cycSA > 0, TRUE, FALSE),
         signedEA = cycEA,
         signedSA = cycSA,
         cycEA = abs(cycEA),
         cycSA = abs(cycSA))

# Revised point cloud  --------------------------------------------------------
p1 <- ggplot(data=df) +
  geom_point(mapping = aes(x=cycEM,y=cycEA,color=cyc.Tension), alpha=0.2) + 
  scale_color_brewer(palette="Set1") +
  scale_x_continuous(limits = c(0,limitEM) , labels = scales::percent) +
  scale_y_continuous(limits = c(0,limitEA), labels = scales::percent) +
  xlab(expression(epsilon["m"])) +
  ylab(expression(epsilon["a"])) +
  ggtitle('Transform to absolute value, set EA to zero for points in compression',baseName)
plot(p1)
savePdfPng('p01')

# Smith-Watson-Topper point cloud  --------------------------------------------

# SWT is an alternative criteria that considers stress and strain

# ldS    = maximum principal stress during loading frame of fatigue cycle
# ulS    = maximum principal stress during unloading frame of fatigue cycle
# SWT    = cycEA * max(stress)
df <- df %>%
  mutate(maxS = ifelse(ldS>ulS,ldS,ulS),
         SWT = maxS * cycEA)

# create SWT plot
p3 <- ggplot(data=df) +
  geom_point(mapping = aes(x=cycEM,y=SWT, color=cyc.Tension), alpha=0.2) + 
  scale_color_brewer(palette="Set1") +
  scale_x_continuous(limits = c(NA,limitEM) , labels = scales::percent) +
  scale_y_continuous(limits = c(NA,limitSWT) ) +
  xlab(expression(epsilon["m"])) +
  ylab(expression(sigma["max"]%.%epsilon["a"])) +
  ggtitle('Smith-Watson-Topper point cloud',baseName)
plot(p3)
savePdfPng('p03')

# Calculate volume of material cycling between A and M ------------------------

# calculate volume of material that transitions between A and M with each cycle
# at crimping (.pre), loading frame of fatigue cycle (.ld), and unloading frame (.ul):
# multiply SDV21 (volume fraction martensite) * IVOL (integration point volume)
# sum over all integration points to calculate the total volume of material transformed
# (vX) at each of these steps. vX.Delta is the difference in transformed volume
# between the loading and unloading frames -- this is the total volume of material
# that the model expects to be alternating between austenite (A) and martensite (M)
# during the fatigue cycle

v.Total  <- sum(df$ulV)
vX.pre   <- sum(df$preM * df$preV)
vX.ld    <- sum(df$ldM * df$ldV)
vX.ul    <- sum(df$ulM * df$ulV)
vX.delta <- abs(vX.ld - vX.ul)

# abaqus treats each element as a mixture of A and M
# but in reality, each atom is either transformed to M or is not
# can we find a way to classify each integration point as A or M?

# Classify A vs M at prestrain (crimp) condition ------------------------------

# this model attempts to classify each element as either A or M
# it first sorts all elements by the reported martensite fraction (SDV21, or preM)
# then, starting at the top of this sorted list, it classifies elements as M,
# and adds up their volume until the previously calculated total volume
# of martensite (vX.pre) is reached.

df <- df %>%
  arrange(desc(preM),desc(preS)) %>%
  mutate(preX = FALSE)

# flag elements that are transformed according to this criteria
volumeCounter <- 0.0
for(i in seq_along(df$el)){
  if(volumeCounter < vX.pre){
    df$preX[i] = TRUE
    volumeCounter = volumeCounter + df$preV[i]
  }
}

# Classify A vs M at loading frame of cycle -----------------------------------

# sort by martensite fraction at end of loading step
df <- df %>%
  arrange(desc(ldM),desc(ldS)) %>%
  mutate(ldX = FALSE)

# flag elements that are transformed
volumeCounter <- 0.0
for(i in seq_along(df$el)){
  if(volumeCounter < vX.ld){
    df$ldX[i] = TRUE
    volumeCounter = volumeCounter + df$ldV[i]
  }
}

# Classify A vs M at unloading frame of cycle ---------------------------------

# sort by martensite fraction at end of loading step
df <- df %>%
  arrange(desc(ulS)) %>%
  mutate(ulX = FALSE)

# flag elements that are transformed
volumeCounter <- 0.0
for(i in seq_along(df$el)){
  if(volumeCounter < vX.ul){
    df$ulX[i] = TRUE
    volumeCounter = volumeCounter + df$ulV[i]
  }
}

# point cloud highlighting phase classification during crimp
# conditional logic is required to avoid errors if M is absent
p4 <- ggplot() +
  geom_point(data=df, mapping = aes(x=cycEM,y=cycEA, color=preX), alpha=0.4) +
  labs(colour = "M crimping") +
  scale_x_continuous(limits = c(0,limitEM), labels = scales::percent) +
  scale_y_continuous(limits = c(0,limitEA), labels = scales::percent) +
  xlab(expression(epsilon["m"])) +
  ylab(expression(epsilon["a"])) +
  ggtitle('p4 point cloud, highlighting points transformed during crimping',baseName)
# don't plot these, they just add confusion (uncomment to include)
#try(plot(p4),silent = TRUE)
#try(savePdfPng('p04'),silent = TRUE)

# Classify each element A, M, or AM -------------------------------------------

# label each element as M (martensite) if transformed during both 
# loading (ldX) and unloading (ulX)
# else, label as AM (austenite-martensite) if 
# transformed during loading OR unloading
# otherwise, label as A (austenite)
phaseLevels <- c('A','AM','M')
df <- df %>%
  mutate(phaseChar = ifelse(ldX & ulX, 'M', ifelse(ldX | ulX, 'AM', 'A')),
         phase = parse_factor(phaseChar, levels = phaseLevels) ) %>%
  dplyr::select(-phaseChar)

# create filtered subsets for elements that are A, M, or cycling between A and M (AM)
filter.A  <- filter(df, phase == 'A')
filter.AM <- filter(df, phase == 'AM')
filter.M  <- filter(df, phase == 'M')

# point cloud highlighting phase classification during fatigue cycle
# conditional logic is required to avoid errors if AM or M are absent
p5 <- ggplot()
if(nrow(filter.A)>0){
  p5 = p5 + geom_point(data=filter.A, 
                       mapping = aes(x=cycEM,y=cycEA, color="A"), 
                       alpha=0.2)
}
if(nrow(filter.AM)>0){
  p5 = p5 + geom_point(data=filter.AM, 
                       mapping = aes(x=cycEM,y=cycEA, color="AM"), 
                       alpha=0.2)
}
if(nrow(filter.M)>0){
  p5 = p5 + geom_point(data=filter.M, 
                       mapping = aes(x=cycEM,y=cycEA, color="M"), 
                       alpha=0.8)
}
p5 = p5 +
  labs(colour = "phase") +
  scale_x_continuous(limits = c(0,limitEM), labels = scales::percent) +
  scale_y_continuous(limits = c(0,limitEA), labels = scales::percent) +
  xlab(expression(epsilon["m"])) +
  ylab(expression(epsilon["a"])) +
  ggtitle('Point cloud highlighting phase of each element during cycle',
          baseName)
plot(p5)
savePdfPng('p05')

# point cloud highlighting phase classification during fatigue cycle
# conditional logic is required to avoid errors if AM or M are absent
p6 <- ggplot()
if(nrow(filter.AM)>0){
  p6 = p6 + geom_point(data=filter.AM, 
                         mapping = aes(x=cycEM,y=cycEA, color="AM"), 
                         alpha=0.2)
}
p6 = p6 +
  labs(colour = "phase") +
  scale_x_continuous(limits = c(0,limitEM), labels = scales::percent) +
  scale_y_continuous(limits = c(0,limitEA), labels = scales::percent) +
  xlab(expression(epsilon["m"])) +
  ylab(expression(epsilon["a"])) +
  ggtitle('Point cloud isolating points alternating A-M during cycle',
          baseName)
plot(p6)
savePdfPng('p06')


# identify only the elements that change phase during the cycle
df <- mutate(df, delta.X = xor(ldX,ulX))

# Create histogram plots ------------------------------------------------------

# histogram of phase volume, by strain amplitude
p8 <- ggplot(df,aes(x=cycEA, weight = ldV, fill=phase)) +
  geom_histogram(bins = 30) +
  xlab(expression(epsilon["a"])) +
  ylab(expression(mm^3)) +
  scale_y_sqrt() +
  scale_x_continuous(limits = c(0,limitEA) , labels = scales::percent) +
  ggtitle('Volume of material in each phase, by strain amplitude',baseName)
plot(p8)
savePdfPng('p08')

# histogram of phase volume, by SWT
p7 <- ggplot(df,aes(x=SWT, weight = ldV, fill=phase)) +
  geom_histogram(bins = 30) +
  xlab(expression(sigma["max"]%.%epsilon["a"])) +
  ylab(expression(mm^3)) +
  scale_y_sqrt() +
  scale_x_continuous(limits = c(0,limitSWT)) +
  ggtitle('Volume of material in each phase, by SWT',baseName)
plot(p7)
savePdfPng('p07')

# Calculate EA and SWT volume at defined intervals ----------------------------

# create EA bins for tabular version of above histograms
EA.bin <- seq(0.0,0.03,by=0.001)
SWT.bin <- seq(0,10.0,by=0.5)

# set min/max labels for each bin
EA.min <- head(EA.bin,-1)
EA.max <- tail(EA.bin,-1)
SWT.min <- head(SWT.bin,-1)
SWT.max <- tail(SWT.bin,-1)

# add columns to classify each row into one of the designated EA bins
df <- mutate(df,
             binEA = cut(cycEA, EA.bin,
                         include.lowest = TRUE, right = FALSE),
             minEA = cut(cycEA, EA.bin, labels = EA.min,
                         include.lowest = TRUE, right = FALSE),
             maxEA = cut(cycEA, EA.bin, labels = EA.max,
                         include.lowest = TRUE, right = FALSE))

# add columns to classify each row into one of the designated SWT bins
df <- mutate(df,
             binSWT = cut(SWT, SWT.bin,
                         include.lowest = TRUE, right = FALSE),
             minSWT = cut(SWT, SWT.bin, labels = SWT.min,
                         include.lowest = TRUE, right = FALSE),
             maxSWT = cut(SWT, SWT.bin, labels = SWT.max,
                         include.lowest = TRUE, right = FALSE))


# bin by EA, group by phase. This is a tabular form of the above EA histogram.
# directly calculate summed volume for each phase, and initialize cumulative
# volume variables (vcA, vcM, ...) to starting value of zero
vBin <- df %>%
  select(binEA,minEA,maxEA,cycEM,cycEA,preE,phase,ldV) %>%
  group_by(binEA,minEA,maxEA) %>%
  summarise(vA  = sum(ldV[phase=="A"]),
            vAM = sum(ldV[phase=="AM"]),
            vM  = sum(ldV[phase=="M"]),
            vT = sum(ldV)) %>%
  arrange(desc(minEA)) %>%
  mutate(vcA  = 0.0,
         vcAM = 0.0,
         vcM  = 0.0,
         vcT  = 0.0)

# repeat for SWT
vBin.SWT <- df %>%
  select(binSWT,minSWT,maxSWT,phase,ldV) %>%
  filter(as.numeric(minSWT) >= 0.0) %>%
  group_by(binSWT,minSWT,maxSWT) %>%
  summarise(vA  = sum(ldV[phase=="A"]),
            vAM = sum(ldV[phase=="AM"]),
            vM  = sum(ldV[phase=="M"]),
            vT = sum(ldV)) %>%
  arrange(desc(minSWT)) %>%
  mutate(vcA  = 0.0,
         vcAM = 0.0,
         vcM  = 0.0,
         vcT  = 0.0)

# calculate cumulative volume of material having a strain amplitude 
# above each threshold 
for(i in seq_along(vBin$binEA)){
  if(i == 1){
    vBin$vcA[i]  = vBin$vA[i]
    vBin$vcAM[i] = vBin$vAM[i]
    vBin$vcM[i]  = vBin$vM[i]
    vBin$vcT[i]  = vBin$ vT[i]
  }
  else{
    vBin$vcA[i]  = vBin$vcA[i-1]  + vBin$vA[i]
    vBin$vcAM[i] = vBin$vcAM[i-1] + vBin$vAM[i]
    vBin$vcM[i]  = vBin$vcM[i-1]  + vBin$vM[i]
    vBin$vcT[i]  = vBin$vcT[i-1]  + vBin$vT[i]
  }
}

# repeat for SWT 
for(i in seq_along(vBin.SWT$binSWT)){
  if(i == 1){
    vBin.SWT$vcA[i]  = vBin.SWT$vA[i]
    vBin.SWT$vcAM[i] = vBin.SWT$vAM[i]
    vBin.SWT$vcM[i]  = vBin.SWT$vM[i]
    vBin.SWT$vcT[i]  = vBin.SWT$vT[i]
  }
  else{
    vBin.SWT$vcA[i]  = vBin.SWT$vcA[i-1]  + vBin.SWT$vA[i]
    vBin.SWT$vcAM[i] = vBin.SWT$vcAM[i-1] + vBin.SWT$vAM[i]
    vBin.SWT$vcM[i]  = vBin.SWT$vcM[i-1]  + vBin.SWT$vM[i]
    vBin.SWT$vcT[i]  = vBin.SWT$vcT[i-1]  + vBin.SWT$vT[i]
  }
}


# rearrange and retain only the necessary values
vBin <- vBin %>%
  ungroup(binEA,minEA) %>%
  select(minEA, maxEA, vA, vAM, vM, vT, vcA, vcAM, vcM, vcT) %>%
  arrange(minEA)

# repeat for SWT
vBin.SWT <- vBin.SWT %>%
  ungroup(binSWT,minSWT) %>%
  select(minSWT, maxSWT, vA, vAM, vM, vT, vcA, vcAM, vcM, vcT) %>%
  arrange(minSWT)

# Create summary data table ---------------------------------------------------

# create export data frame containing a single column of summary details
# this will be the first group of rows in the exported summary file
Xdf <- tribble(
  ~label, ~value,
  'baseName',baseName,
  'ident',ident,
  'code',substr(ident,4,6),
  'symmetry',symmetry,
  'v.Total',v.Total,
  'vX.pre',vX.pre,
  'vX.ld',vX.ld,
  'vX.ul',vX.ul,
  'vX.delta',vX.delta,
  'EA.max',max(df$cycEA[df$cyc.Tension==TRUE]),
  'EM.max',max(df$cycEM[df$cyc.Tension==TRUE]),
  'SA.max',max(df$cycSA[df$cyc.Tension==TRUE]),
  'SM.max',max(df$cycSM[df$cyc.Tension==TRUE]),
  'SWT.max',max(df$SWT[df$cyc.Tension==TRUE])
)

# create export variables for volume above each of the designated EA thresholds

# total volume over each EA threshold
for(i in seq_along(vBin$minEA)){
  Xdf <- add_row(Xdf,
          label=ifelse(vBin$minEA[i]==0,
                       paste('EA.gt.',"0.000",'.T',sep=''),
                       paste('EA.gt.',
                             format(vBin$minEA[i],nsmall=3),
                             '.T',
                             sep='')
                       ),
          value=vBin$vcT[i])
}

# AM volume over each EA threshold
for(i in seq_along(vBin$minEA)){
  Xdf <- add_row(Xdf,
                 label=ifelse(vBin$minEA[i]==0,
                              paste('EA.gt.',"0.000",'.AM',sep=''),
                              paste('EA.gt.',
                                    format(vBin$minEA[i],nsmall=3),
                                    '.AM',
                                    sep='')
                 ),
                 value=vBin$vcAM[i])
}

# total volume over each SWT threshold
for(i in seq_along(vBin.SWT$minSWT)){
  Xdf <- add_row(Xdf,
                 label=ifelse(vBin.SWT$minSWT[i]==0,
                              paste('SWT.gt.',"0.0",'.T',sep=''),
                              paste('SWT.gt.',
                                    format(vBin.SWT$minSWT[i],digits=1,nsmall=1,drop0trailing=FALSE,zero.print=TRUE),
                                    '.T',
                                    sep='')
                 ),
                 value=vBin.SWT$vcT[i])
}

# AM volume over each SWT threshold
for(i in seq_along(vBin.SWT$minSWT)){
  Xdf <- add_row(Xdf,
                 label=ifelse(vBin.SWT$minSWT[i]==0,
                              paste('SWT.gt.',"0.0",'AM',sep=''),
                              paste('SWT.gt.',
                                    format(vBin.SWT$minSWT[i],digits=1,nsmall=1,drop0trailing=FALSE,zero.print=TRUE),
                                    '.AM',
                                    sep='')
                 ),
                 value=vBin.SWT$vcAM[i])
}

# Export the summary data -----------------------------------------------------

# export table as CSV file
write_csv(Xdf,paste('out/',ident,'.csv',sep=''))
