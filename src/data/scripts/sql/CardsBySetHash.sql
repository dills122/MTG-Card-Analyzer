select SetName, Count(1) as CardsInSet from Card_Hashes
group by SetName
order by Count(1) DESC, SetName DESC;