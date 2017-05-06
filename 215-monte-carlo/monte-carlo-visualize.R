# monte-carlo-visualize.R
#
# Copyright 2017 Confluent Medical Technologies, Inc
# 
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
# http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# overview --------------------------------------------------------------------

# visualize results of monte-carlo analysis

# IN:    *.mc.csv results created by monte-carlo-xct-fea.R (from ./mc-out folder)
# OUT:   PNG and PDF plots in ./mc-pdf and ./mc-png folders

# NEXT:  we are done for now!

# Clear environment and load packages -----------------------------------------

# install required packages if necessary 
# install.packages('tidyverse')
# install.packages('rstudioapi')

rm(list=ls())
library(tidyverse)           # http://r4ds.had.co.nz/

# file management  ------------------------------------------------------------

#df <- read_csv('./mc-out/open-frame-fatigue-v25mm-9pct-500se508-500eli.mc.csv.ORIGINAL')
df <- read_csv('./mc-out/open-frame-fatigue-v25mm-9pct-500se508-500eli.mc.csv')

# set working directory to location of this script
# note: this is problematic because in RStudio, the default working directory
# is the project folder, and this is one level down (so we will suffer from
# file-not-found errors if we don't fix this). There is not an easy fix.
# this approach requires the rstudioapi package. see also:
# http://stackoverflow.com/questions/13672720/r-command-for-setting-working-directory-to-source-file-location
setwd(dirname(rstudioapi::getActiveDocumentContext()$path)) 

# function to save file as PDF and PNG
# PDF files are generally preferred, but
# get large and unwieldy with many points are plotted
savePdfPng <- function(name){
  ggsave(paste('pdf/',ident,'-',name,'.pdf',sep=''),
         width=8,height=6)
  ggsave(paste('png/',ident,'-',name,'.png',sep=''),
         width=8,height=6,dpi = 300)
}


df <- df %>%
  arrange(matl,ident) %>%
  mutate(matl = as.factor(matl),
         ident = as.factor(ident)) %>%
  group_by(matl,ident) %>%
  gather('key','value',4:28) %>%
  rowwise() %>%
  mutate(orient = substr(key,1,regexpr("\\.",key)[1]-1),
         suffix = substr(key,regexpr("\\.",key)[1]+1,nchar(key)))

df.tidy <- df %>%
  spread(suffix,value) %>%
  select(-key) %>%
  group_by(ident,matl,run,orient) %>%
  summarise_each(funs(sum(., na.rm=TRUE))) %>%
  ungroup() %>%
  mutate(cycEA = ifelse(cycEA==0,NA,cycEA),
         cycSA = ifelse(cycSA==0,NA,cycSA),
         D     = ifelse(D==0,NA,D),
         dK    = ifelse(dK==0,NA,dK),
         dS    = ifelse(dS==0,NA,dS),
         k     = ifelse(k==0,NA,k),
         q50   = ifelse(q50==0,NA,q50),
         q99   = ifelse(q99==0,NA,q99))
  #left_join(df,df,by=c('ident','matl','run'))

df <- df.tidy

# summary <- df %>%
#   summarise(n = n(),
#             dK11.mean = mean(dK11.dK),
#             dK22.mean = mean(dK22.dK),
#             dK33.mean = mean(dK33.dK),
#             dK11.max = max(dK11.dK),
#             dK22.max = max(dK22.dK),
#             dK33.max = max(dK33.dK))

# also: add qplot(x=k,y=dk)

coords <- c(`dK11`='r',
            `dK22`='theta',
            `dK33`='Z')

lucky <- ggplot(data=filter(df,orient=='dK33'),aes(x=D,y=dS,color=dK)) +
  geom_point(alpha=1/2) +
  facet_grid(matl ~ .) +
  scale_colour_gradientn(colours = rev(RColorBrewer::brewer.pal(5,'Spectral'))) +
  xlab(expression(paste('d',` (`,mu,'m',`)`))) +
  ylab(expression(paste(Delta,sigma,` (MPa)`))) +
  labs(color = expression(paste(Delta,'K'))) +
  ggtitle('max. delta stress intensity factor, by cyclic stress and defect (inclusion) size',
          'unlucky combination at upper right: largest defect at highest stress')
plot(lucky)

dK.vs.K <- ggplot(data=filter(df,orient=='dK11'|orient=='dK22'|orient=='dK33'),
               aes(x=k,y=dK,color=matl)) +
  geom_point() +
  facet_grid(. ~ orient, labeller = as_labeller(coords)) +
  ylab(expression(paste(Delta,'K'))) +
  xlab('K') +
  labs(color = 'material') +
  ggtitle('maximum stress intensity factor and delta stress intensity factor',
          'for 500 monte carlo runs with each material')
plot(dK.vs.K)

max.K <- ggplot(data=filter(df,
                            orient=='dK11'|
                              orient=='dK22'|
                              orient=='dK33'),aes(x=k,fill=matl)) +
  geom_histogram() +
  facet_grid(. ~ orient, labeller = as_labeller(coords)) +
  xlab(expression(paste('K',` (MPa`,sqrt(m),')'))) +
  labs(fill = 'material') +
  ggtitle('maximum stress intensity factor',
          'for 500 monte carlo runs with each material')
plot(max.K)

max.dK <- ggplot(data=filter(df,
                           orient=='dK11'|
                             orient=='dK22'|
                             orient=='dK33'),aes(x=dK,fill=matl)) +
  geom_histogram() +
  facet_grid(. ~ orient, labeller = as_labeller(coords)) +
  xlab(expression(paste(Delta,'K',` (MPa`,sqrt(m),')'))) +
  labs(fill = 'material') +
  ggtitle('maximum delta stress intensity factor',
          'for 500 monte carlo runs with each material')
plot(max.dK)

max.dK.v.D <- ggplot(data=filter(df,orient=='dK33'),aes(x=D,y=dK,color=matl)) +
  geom_point(alpha=1/5) +
  xlab(expression(paste('d',` (`,mu,'m',`)`))) +
  ylab(expression(paste(Delta,'K',` (MPa`,sqrt(m),')'))) +
  ggtitle('maximum stress intensity factor depends strongly on defect (inclusion) size',
          '500 monte carlo runs with each material')
plot(max.dK.v.D)


# maximum dK vs 99th, 50th pctl dK
# measure of the "extremity" of defect size
# maximum value is in the ranege 1.5x to >2x 99th pctl value
q.99 <- ggplot(data=filter(df,orient=='dK33'),aes(x=q99,y=dK)) +
  geom_point(aes(color=matl),alpha=1/5) +
  ggtitle('q.99')
plot(q.99)

q.50 <- ggplot(data=filter(df,orient=='dK33'),aes(x=q50,y=dK)) +
  geom_point(aes(color=matl),alpha=1/5) +
  ggtitle('q.50')
plot(q.50)
